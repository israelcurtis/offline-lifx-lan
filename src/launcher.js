import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { appRootDir } from "./app-paths.js";
import { acquireSingleInstanceLock, getDefaultLockPath } from "./single-instance-lock.js";

const RESTART_EXIT_CODE = 75;
const serverEntryPath = path.join(appRootDir, "src", "server.js");

let child = null;
let shuttingDown = false;
let releaseLock = () => {};

try {
  releaseLock = acquireSingleInstanceLock(getDefaultLockPath(appRootDir));
} catch (error) {
  if (error.code === "ELOCKED") {
    console.error(error.message);
    process.exit(1);
  }

  throw error;
}

function startChild() {
  child = spawn(process.execPath, [serverEntryPath], {
    stdio: "inherit",
    cwd: appRootDir,
    env: process.env
  });

  child.on("exit", (code, signal) => {
    const shouldRestart = !shuttingDown && signal === null && code === RESTART_EXIT_CODE;
    if (shouldRestart) {
      setTimeout(startChild, 150);
      return;
    }

    releaseLock();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function forwardSignal(signal) {
  shuttingDown = true;
  if (child) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("exit", () => releaseLock());

startChild();
