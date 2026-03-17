import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  loadKnownDevicesState,
  saveKnownDevicesState
} from "../src/known-devices-store.js";

const tempPaths = new Set();
const originalKnownDevicesPath = process.env.KNOWN_DEVICES_PATH;

afterEach(() => {
  if (originalKnownDevicesPath === undefined) {
    delete process.env.KNOWN_DEVICES_PATH;
  } else {
    process.env.KNOWN_DEVICES_PATH = originalKnownDevicesPath;
  }

  for (const targetPath of tempPaths) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  tempPaths.clear();
});

function makeTempKnownDevicesPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-known-devices-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "known-devices.json");
}

test("loadKnownDevicesState returns empty state when the file does not exist", () => {
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();

  assert.deepEqual(loadKnownDevicesState(), {
    enabledIds: [],
    disabledIds: []
  });
});

test("saveKnownDevicesState normalizes ids and loadKnownDevicesState reads them back", () => {
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();

  saveKnownDevicesState({
    enabledIds: ["a", "a", "b", ""],
    disabledIds: ["b", "c", "c", ""]
  });

  assert.deepEqual(loadKnownDevicesState(), {
    enabledIds: ["a", "b"],
    disabledIds: ["c"]
  });
});
