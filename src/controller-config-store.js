import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

const defaultControllerConfigPath = path.join(appRootDir, "config", "options.json");
const DEFAULT_TRANSITION_DURATION_MS = 1000;
const MIN_TRANSITION_DURATION_MS = 0;
const MAX_TRANSITION_DURATION_MS = 5000;
const DEFAULT_SCENE_KELVIN = 5500;
const MIN_SCENE_KELVIN = 1500;
const MAX_SCENE_KELVIN = 9000;

function normalizeTransitionDuration(transitionDurationMs) {
  const numericValue = Number(transitionDurationMs);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_TRANSITION_DURATION_MS;
  }

  return Math.min(
    Math.max(Math.round(numericValue), MIN_TRANSITION_DURATION_MS),
    MAX_TRANSITION_DURATION_MS
  );
}

function normalizeSceneKelvin(defaultSceneKelvin) {
  const numericValue = Number(defaultSceneKelvin);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_SCENE_KELVIN;
  }

  return Math.min(
    Math.max(Math.round(numericValue), MIN_SCENE_KELVIN),
    MAX_SCENE_KELVIN
  );
}

export function getControllerConfigFilePath() {
  return process.env.CONTROLLER_CONFIG_PATH
    ? resolveFromAppRoot(process.env.CONTROLLER_CONFIG_PATH)
    : defaultControllerConfigPath;
}

export function loadControllerConfig() {
  const filePath = getControllerConfigFilePath();
  const parsed = loadJsonFile(filePath, {
    onMissing: () => ({
      transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS,
      defaultSceneKelvin: DEFAULT_SCENE_KELVIN
    }),
    onInvalid: (error) => {
      console.warn(`Invalid controller config JSON at ${filePath}: ${error.message}`);
      return {};
    }
  });
  return {
    transitionDurationMs: normalizeTransitionDuration(parsed.transitionDurationMs),
    defaultSceneKelvin: normalizeSceneKelvin(parsed.defaultSceneKelvin)
  };
}

export function saveControllerConfig({
  transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS,
  defaultSceneKelvin = DEFAULT_SCENE_KELVIN
}) {
  const filePath = getControllerConfigFilePath();
  const payload = {
    transitionDurationMs: normalizeTransitionDuration(transitionDurationMs),
    defaultSceneKelvin: normalizeSceneKelvin(defaultSceneKelvin)
  };

  saveJsonFile(filePath, payload);
  return payload;
}

export {
  DEFAULT_TRANSITION_DURATION_MS,
  MIN_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  DEFAULT_SCENE_KELVIN,
  MIN_SCENE_KELVIN,
  MAX_SCENE_KELVIN
};
