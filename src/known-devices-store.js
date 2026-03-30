import { getStateFilePath } from "./app-state-paths.js";
import { buildKnownDevicesState, mergeKnownDeviceRecords, normalizeKnownDevices } from "./known-device-model.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

export function getKnownDevicesFilePath() {
  return getStateFilePath("known-devices.json", "KNOWN_DEVICES_PATH");
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
