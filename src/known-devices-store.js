import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";
import { buildKnownDevicesState, mergeKnownDeviceRecords, normalizeKnownDevices } from "./known-device-model.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

const defaultKnownDevicesPath = path.join(appRootDir, "config", "known-devices.json");

export function getKnownDevicesFilePath() {
  return process.env.KNOWN_DEVICES_PATH
    ? resolveFromAppRoot(process.env.KNOWN_DEVICES_PATH)
    : defaultKnownDevicesPath;
}

export function loadKnownDevicesState() {
  const filePath = getKnownDevicesFilePath();
  const payload = loadJsonFile(filePath, {
    onMissing: () => ({ devices: [] }),
    onInvalid: (error) => {
      console.warn(`Invalid known devices JSON at ${filePath}: ${error.message}`);
      return { devices: [] };
    }
  });

  return buildKnownDevicesState(payload?.devices);
}

export function saveKnownDevicesState({ devices = [] } = {}) {
  const filePath = getKnownDevicesFilePath();
  const normalizedDevices = normalizeKnownDevices(devices);
  saveJsonFile(filePath, {
    devices: normalizedDevices
  });

  return buildKnownDevicesState(normalizedDevices);
}

export { mergeKnownDeviceRecords, normalizeKnownDevices };
