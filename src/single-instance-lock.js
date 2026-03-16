import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

function readLockInfo(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "EPERM") {
      return true;
    }

    if (error.code === "ESRCH") {
      return false;
    }

    throw error;
  }
}

function writeLockFile(lockPath, pid) {
  const lockHandle = fs.openSync(lockPath, "wx", 0o600);
  const payload = JSON.stringify(
    {
      pid,
      cwd: process.cwd(),
      createdAt: new Date().toISOString()
    },
    null,
    2
  );

  fs.writeFileSync(lockHandle, `${payload}\n`, "utf8");
  return lockHandle;
}

export function getDefaultLockPath(cwd = process.cwd()) {
  const digest = createHash("sha1").update(cwd).digest("hex").slice(0, 12);
  return path.join(tmpdir(), `offline-lifx-lan-${digest}.lock`);
}

export function acquireSingleInstanceLock(lockPath, { pid = process.pid } = {}) {
  let lockHandle;

  try {
    lockHandle = writeLockFile(lockPath, pid);
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    const existingLock = readLockInfo(lockPath);
    const existingPid = Number(existingLock?.pid);

    if (isPidRunning(existingPid)) {
      const lockError = new Error(
        `Another offline-lifx-lan instance is already running (PID ${existingPid}).`
      );
      lockError.code = "ELOCKED";
      lockError.pid = existingPid;
      lockError.lockPath = lockPath;
      throw lockError;
    }

    fs.rmSync(lockPath, { force: true });
    lockHandle = writeLockFile(lockPath, pid);
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;

    try {
      fs.closeSync(lockHandle);
    } catch {}

    const currentLock = readLockInfo(lockPath);
    if (!currentLock || Number(currentLock.pid) === pid) {
      fs.rmSync(lockPath, { force: true });
    }
  };
}
