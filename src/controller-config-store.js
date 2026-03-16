import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

const defaultControllerConfigPath = path.join(appRootDir, "config", "config.json");
const DEFAULT_TRANSITION_DURATION_MS = 1000;
const MIN_TRANSITION_DURATION_MS = 0;
const MAX_TRANSITION_DURATION_MS = 5000;

function normalizeTargetIds(targetIds) {
  if (!Array.isArray(targetIds)) {
    return [];
  }

  return [...new Set(targetIds.map((value) => String(value).trim()).filter(Boolean))];
}

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
      enabledIds: [],
      disabledIds: [],
      transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    enabledIds: normalizeTargetIds(parsed.enabledIds),
    disabledIds: normalizeTargetIds(parsed.disabledIds),
    transitionDurationMs: normalizeTransitionDuration(parsed.transitionDurationMs)
  };
}

export function saveControllerConfig({
  enabledIds = [],
  disabledIds = [],
  transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS
}) {
  const filePath = getControllerConfigFilePath();
  const normalizedEnabledIds = normalizeTargetIds(enabledIds);
  const normalizedDisabledIds = normalizeTargetIds(disabledIds).filter((id) => !normalizedEnabledIds.includes(id));
  const payload = {
    enabledIds: normalizedEnabledIds,
    disabledIds: normalizedDisabledIds,
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
