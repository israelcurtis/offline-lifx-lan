import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";
import { getControllerConfigFilePath, loadControllerConfig } from "./controller-config-store.js";

dotenv.config({ path: path.join(appRootDir, ".env"), quiet: true });

const defaultScenePath = path.join(appRootDir, "config", "scenes.json");
const controllerConfig = loadControllerConfig();

function readSceneConfig() {
  const scenePath = process.env.SCENES_PATH
    ? resolveFromAppRoot(process.env.SCENES_PATH)
    : defaultScenePath;
  const raw = fs.readFileSync(scenePath, "utf8");
  return JSON.parse(raw);
}

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
    enabledTargetIds: controllerConfig.enabledIds,
    disabledTargetIds: controllerConfig.disabledIds,
    transitionDurationMs: controllerConfig.transitionDurationMs,
    controllerConfigPath: getControllerConfigFilePath(),
    scenes: readSceneConfig()
  };
}
