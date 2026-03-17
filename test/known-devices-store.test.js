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
    devices: [],
    enabledIds: [],
    disabledIds: [],
    capabilitiesById: {}
  });
});

test("saveKnownDevicesState normalizes ids and loadKnownDevicesState reads them back", () => {
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();
  const knownDevicesPath = process.env.KNOWN_DEVICES_PATH;

  saveKnownDevicesState({
    enabledIds: ["a", "a", "b", ""],
    disabledIds: ["b", "c", "c", ""],
    capabilitiesById: {
      a: { color: true },
      c: { color: false },
      "": { color: true }
    }
  });

  assert.deepEqual(loadKnownDevicesState(), {
    devices: [
      { id: "a", enabled: true, color: true },
      { id: "b", enabled: true },
      { id: "c", enabled: false, color: false }
    ],
    enabledIds: ["a", "b"],
    disabledIds: ["c"],
    capabilitiesById: {
      a: { color: true },
      c: { color: false }
    }
  });

  const savedFile = JSON.parse(fs.readFileSync(knownDevicesPath, "utf8"));
  assert.deepEqual(savedFile, {
    devices: [
      { id: "a", enabled: true, color: true },
      { id: "b", enabled: true },
      { id: "c", enabled: false, color: false }
    ]
  });
});

test("loadKnownDevicesState reads the consolidated devices array format", () => {
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();

  fs.writeFileSync(
    process.env.KNOWN_DEVICES_PATH,
    `${JSON.stringify({
      devices: [
        { id: "a", enabled: true, color: true },
        { id: "b", enabled: false, color: false },
        { id: "c", enabled: true }
      ]
    }, null, 2)}\n`,
    "utf8"
  );

  assert.deepEqual(loadKnownDevicesState(), {
    devices: [
      { id: "a", enabled: true, color: true },
      { id: "b", enabled: false, color: false },
      { id: "c", enabled: true }
    ],
    enabledIds: ["a", "c"],
    disabledIds: ["b"],
    capabilitiesById: {
      a: { color: true },
      b: { color: false }
    }
  });
});
