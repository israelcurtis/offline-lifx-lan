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

function readLinuxBootId() {
  try {
    return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() || null;
  } catch {
    return null;
  }
}

function readLinuxProcessStartTicks(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const commEndIndex = stat.lastIndexOf(")");

    if (commEndIndex < 0) {
      return null;
    }

    const fields = stat.slice(commEndIndex + 2).trim().split(/\s+/);
    const startTicks = Number(fields[19]);
    return Number.isFinite(startTicks) && startTicks > 0 ? startTicks : null;
  } catch {
    return null;
  }
}

function getProcessIdentity(pid) {
  return {
    pid,
    cwd: process.cwd(),
    createdAt: new Date().toISOString(),
    bootId: readLinuxBootId(),
    startTicks: readLinuxProcessStartTicks(pid)
  };
}

function isSameProcess(lockInfo, pid) {
  const lockPid = Number(lockInfo?.pid);
  if (!Number.isInteger(lockPid) || lockPid !== pid) {
    return false;
  }

  const currentBootId = readLinuxBootId();
  const currentStartTicks = readLinuxProcessStartTicks(pid);

  if (!lockInfo?.bootId || !currentBootId) {
    return false;
  }

  if (!Number.isFinite(Number(lockInfo?.startTicks)) || currentStartTicks === null) {
    return false;
  }

  return lockInfo.bootId === currentBootId && Number(lockInfo.startTicks) === currentStartTicks;
}

function writeLockFile(lockPath, pid) {
  const lockHandle = fs.openSync(lockPath, "wx", 0o600);
  const payload = JSON.stringify(getProcessIdentity(pid), null, 2);

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
    const samePidAsCurrentProcess = existingPid === pid;

    if (isPidRunning(existingPid) && !samePidAsCurrentProcess && !isSameProcess(existingLock, pid)) {
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
