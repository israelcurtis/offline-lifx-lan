import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireSingleInstanceLock,
  getDefaultLockPath
} from "../src/single-instance-lock.js";

const tempPaths = new Set();

afterEach(() => {
  for (const targetPath of tempPaths) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  tempPaths.clear();
});

function makeTempLockPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-lock-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "controller.lock");
}

test("acquireSingleInstanceLock blocks a second live instance", () => {
  const lockPath = makeTempLockPath();
  const releaseLock = acquireSingleInstanceLock(lockPath, { pid: process.pid });

  assert.throws(
    () => acquireSingleInstanceLock(lockPath, { pid: process.pid + 1 }),
    (error) => error.code === "ELOCKED" && error.pid === process.pid
  );

  releaseLock();
  assert.equal(fs.existsSync(lockPath), false);
});

test("acquireSingleInstanceLock replaces a stale lock file", () => {
  const lockPath = makeTempLockPath();
  fs.writeFileSync(
    lockPath,
    JSON.stringify({
      pid: 999999,
      cwd: "/tmp/stale",
      createdAt: "2026-01-01T00:00:00.000Z"
    })
  );

  const releaseLock = acquireSingleInstanceLock(lockPath, { pid: process.pid });
  const currentLock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

  assert.equal(currentLock.pid, process.pid);

  releaseLock();
  assert.equal(fs.existsSync(lockPath), false);
});

test("getDefaultLockPath is stable for the same cwd", () => {
  const cwd = "/Users/israel/Github/offline-lifx-lan";

  assert.equal(getDefaultLockPath(cwd), getDefaultLockPath(cwd));
});
