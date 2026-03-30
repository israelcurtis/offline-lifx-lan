import fs from "node:fs";
import { getControllerConfigFilePath, loadControllerConfig } from "./controller-config-store.js";
import { getKnownDevicesFilePath, loadKnownDevicesState } from "./known-devices-store.js";
import { getScenesFilePath, loadScenesConfig } from "./scene-store.js";

function removeStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.rmSync(filePath, { force: true });
}

export function resetAppState() {
  removeStateFile(getScenesFilePath());
  removeStateFile(getControllerConfigFilePath());
  removeStateFile(getKnownDevicesFilePath());

  return {
    scenes: loadScenesConfig(),
    controllerConfig: loadControllerConfig(),
    knownDevicesState: loadKnownDevicesState()
  };
}
