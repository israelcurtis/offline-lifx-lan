import { bootstrapStateFile, getDefaultConfigFilePath, getStateFilePath } from "./app-state-paths.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

const defaultControllerConfigPath = getDefaultConfigFilePath("options.json");
const MIN_TRANSITION_DURATION_MS = 0;
const MAX_TRANSITION_DURATION_MS = 5000;
const MIN_SCENE_KELVIN = 1500;
const MAX_SCENE_KELVIN = 9000;

function normalizeTransitionDuration(transitionDurationMs, fallbackValue) {
  const numericValue = Number(transitionDurationMs);
  if (!Number.isFinite(numericValue)) {
    return fallbackValue;
  }

  return Math.min(
    Math.max(Math.round(numericValue), MIN_TRANSITION_DURATION_MS),
    MAX_TRANSITION_DURATION_MS
  );
}

function normalizeSceneKelvin(defaultSceneKelvin, fallbackValue) {
  const numericValue = Number(defaultSceneKelvin);
  if (!Number.isFinite(numericValue)) {
    return fallbackValue;
  }

  return Math.min(
    Math.max(Math.round(numericValue), MIN_SCENE_KELVIN),
    MAX_SCENE_KELVIN
  );
}

function normalizeControllerConfig(parsed = {}, defaults) {
  return {
    transitionDurationMs: normalizeTransitionDuration(
      parsed.transitionDurationMs,
      defaults.transitionDurationMs
    ),
    defaultSceneKelvin: normalizeSceneKelvin(
      parsed.defaultSceneKelvin,
      defaults.defaultSceneKelvin
    )
  };
}

function loadDefaultControllerConfig() {
  const parsed = loadJsonFile(defaultControllerConfigPath, {
    onMissing: () => {
      throw new Error(`Default controller config file not found at ${defaultControllerConfigPath}.`);
    },
    onInvalid: (error) => {
      throw new Error(
        `Invalid default controller config in ${defaultControllerConfigPath}: ${error.message}`
      );
    }
  });

  return normalizeControllerConfig(parsed, parsed);
}

export function getControllerConfigFilePath() {
  return getStateFilePath("options.json", "CONTROLLER_CONFIG_PATH");
}

export function loadControllerConfig() {
  const filePath = getControllerConfigFilePath();
  const defaultConfig = loadDefaultControllerConfig();
  bootstrapStateFile({
    filePath,
    defaultFilePath: defaultControllerConfigPath
  });
  const parsed = loadJsonFile(filePath, {
    onMissing: () => defaultConfig,
    onInvalid: (error) => {
      console.warn(`Invalid controller config JSON at ${filePath}: ${error.message}`);
      return defaultConfig;
    }
  });
  return normalizeControllerConfig(parsed, defaultConfig);
}

export function saveControllerConfig({
  transitionDurationMs,
  defaultSceneKelvin
} = {}) {
  const filePath = getControllerConfigFilePath();
  const defaultConfig = loadDefaultControllerConfig();
  bootstrapStateFile({
    filePath,
    defaultFilePath: defaultControllerConfigPath
  });
  const payload = {
    transitionDurationMs: normalizeTransitionDuration(
      transitionDurationMs ?? defaultConfig.transitionDurationMs,
      defaultConfig.transitionDurationMs
    ),
    defaultSceneKelvin: normalizeSceneKelvin(
      defaultSceneKelvin ?? defaultConfig.defaultSceneKelvin,
      defaultConfig.defaultSceneKelvin
    )
  };

  saveJsonFile(filePath, payload);
  return payload;
}

export {
  MIN_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  MIN_SCENE_KELVIN,
  MAX_SCENE_KELVIN
};
