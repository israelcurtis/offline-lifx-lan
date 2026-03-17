import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";
import { appRootDir } from "./app-paths.js";
import { getControllerConfigFilePath, loadControllerConfig } from "./controller-config-store.js";
import { loadKnownDevicesState } from "./known-devices-store.js";
import { loadScenesConfig } from "./scene-store.js";

dotenv.config({ path: path.join(appRootDir, ".env"), quiet: true });

const controllerConfig = loadControllerConfig();
const knownDevicesState = loadKnownDevicesState();

export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT ?? "3000", 10),
    discoveryWaitMs: Number.parseInt(process.env.DISCOVERY_WAIT_MS ?? "4000", 10),
    host: process.env.HOST ?? "0.0.0.0",
    targetLabels: (process.env.LIFX_TARGET_LABELS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    targetIds: (process.env.LIFX_TARGET_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    targetAddresses: (process.env.LIFX_TARGET_ADDRESSES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    enabledTargetIds: knownDevicesState.enabledIds,
    disabledTargetIds: knownDevicesState.disabledIds,
    transitionDurationMs: controllerConfig.transitionDurationMs,
    defaultSceneKelvin: controllerConfig.defaultSceneKelvin,
    controllerConfigPath: getControllerConfigFilePath(),
    scenes: loadScenesConfig()
  };
}
