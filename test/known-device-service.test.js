import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { KnownDeviceService } from "../src/known-device-service.js";

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
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-known-device-service-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "known-devices.json");
}

test("replaceWithDiscoveredLights rebuilds known devices from the current scan", () => {
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();
  const config = {
    knownDevices: [
      { id: "bulb-a", enabled: true, color: true },
      { id: "bulb-b", enabled: false, color: false },
      { id: "bulb-c", enabled: true, color: true }
    ],
    targetIds: [],
    targetLabels: [],
    targetAddresses: []
  };
  const service = new KnownDeviceService(config);

  const savedState = service.replaceWithDiscoveredLights([
    { id: "bulb-a" },
    { id: "bulb-b" },
    { id: "bulb-d" }
  ]);

  assert.deepEqual(savedState.devices, [
    { id: "bulb-a", enabled: true, color: true },
    { id: "bulb-b", enabled: false, color: false },
    { id: "bulb-d", enabled: true }
  ]);
  assert.deepEqual(config.knownDevices, savedState.devices);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(process.env.KNOWN_DEVICES_PATH, "utf8")),
    { devices: savedState.devices }
  );
});
