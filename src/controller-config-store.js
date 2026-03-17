import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

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
  if (!fs.existsSync(filePath)) {
    return {
      transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS,
      defaultSceneKelvin: DEFAULT_SCENE_KELVIN
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
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

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
