import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

const defaultKnownDevicesPath = path.join(appRootDir, "config", "known-devices.json");

function normalizeTargetIds(targetIds) {
  if (!Array.isArray(targetIds)) {
    return [];
  }

  return [...new Set(targetIds.map((value) => String(value).trim()).filter(Boolean))];
}

export function getKnownDevicesFilePath() {
  return process.env.KNOWN_DEVICES_PATH
    ? resolveFromAppRoot(process.env.KNOWN_DEVICES_PATH)
    : defaultKnownDevicesPath;
}

export function loadKnownDevicesState() {
  const filePath = getKnownDevicesFilePath();
  if (!fs.existsSync(filePath)) {
    return {
      enabledIds: [],
      disabledIds: []
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const enabledIds = normalizeTargetIds(parsed.enabledIds);

  return {
    enabledIds,
    disabledIds: normalizeTargetIds(parsed.disabledIds).filter((id) => !enabledIds.includes(id))
  };
}

export function saveKnownDevicesState({ enabledIds = [], disabledIds = [] }) {
  const filePath = getKnownDevicesFilePath();
  const normalizedEnabledIds = normalizeTargetIds(enabledIds);
  const payload = {
    enabledIds: normalizedEnabledIds,
    disabledIds: normalizeTargetIds(disabledIds).filter((id) => !normalizedEnabledIds.includes(id))
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}
