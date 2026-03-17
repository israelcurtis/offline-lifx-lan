import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

const defaultControllerConfigPath = path.join(appRootDir, "config", "options.json");
const DEFAULT_TRANSITION_DURATION_MS = 1000;
const MIN_TRANSITION_DURATION_MS = 0;
const MAX_TRANSITION_DURATION_MS = 5000;

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

export function getControllerConfigFilePath() {
  return process.env.CONTROLLER_CONFIG_PATH
    ? resolveFromAppRoot(process.env.CONTROLLER_CONFIG_PATH)
    : defaultControllerConfigPath;
}

export function loadControllerConfig() {
  const filePath = getControllerConfigFilePath();
  if (!fs.existsSync(filePath)) {
    return {
      transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    transitionDurationMs: normalizeTransitionDuration(parsed.transitionDurationMs)
  };
}

export function saveControllerConfig({ transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS }) {
  const filePath = getControllerConfigFilePath();
  const payload = {
    transitionDurationMs: normalizeTransitionDuration(transitionDurationMs)
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export {
  DEFAULT_TRANSITION_DURATION_MS,
  MIN_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS
};
