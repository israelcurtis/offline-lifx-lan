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

function normalizeCapabilitiesById(capabilitiesById) {
  if (!capabilitiesById || typeof capabilitiesById !== "object" || Array.isArray(capabilitiesById)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(capabilitiesById)
      .map(([id, capabilities]) => {
        const normalizedId = String(id).trim();
        if (!normalizedId || !capabilities || typeof capabilities !== "object") {
          return null;
        }

        return [
          normalizedId,
          {
            color: Boolean(capabilities.color)
          }
        ];
      })
      .filter(Boolean)
  );
}

function normalizeKnownDevices(devices) {
  if (!Array.isArray(devices)) {
    return [];
  }

  const normalizedById = new Map();
  for (const device of devices) {
    if (!device || typeof device !== "object" || Array.isArray(device)) {
      continue;
    }

    const id = String(device.id ?? "").trim();
    if (!id) {
      continue;
    }

    const normalizedDevice = {
      id,
      enabled: Boolean(device.enabled)
    };

    if (device.color != null) {
      normalizedDevice.color = Boolean(device.color);
    }

    normalizedById.set(id, normalizedDevice);
  }

  return [...normalizedById.values()];
}

function buildKnownDevices({ enabledIds = [], disabledIds = [], capabilitiesById = {} }) {
  // Keep the persisted file human-readable by storing one record per device instead of
  // separate targeting/capability collections that have to be mentally joined by id.
  const normalizedEnabledIds = normalizeTargetIds(enabledIds);
  const enabledIdSet = new Set(normalizedEnabledIds);
  const normalizedDisabledIds = normalizeTargetIds(disabledIds).filter((id) => !enabledIdSet.has(id));
  const disabledIdSet = new Set(normalizedDisabledIds);
  const normalizedCapabilitiesById = normalizeCapabilitiesById(capabilitiesById);
  const orderedIds = [
    ...normalizedEnabledIds,
    ...normalizedDisabledIds,
    ...Object.keys(normalizedCapabilitiesById).filter((id) => !enabledIdSet.has(id) && !disabledIdSet.has(id))
  ];

  return [...new Set(orderedIds)].map((id) => {
    const capabilities = normalizedCapabilitiesById[id];
    const record = {
      id,
      enabled: enabledIdSet.has(id)
    };

    if (capabilities) {
      record.color = capabilities.color;
    }

    return record;
  });
}

function buildRuntimeStateFromKnownDevices(devices) {
  const normalizedDevices = normalizeKnownDevices(devices);
  const enabledIds = normalizedDevices.filter((device) => device.enabled).map((device) => device.id);

  return {
    devices: normalizedDevices,
    enabledIds,
    disabledIds: normalizedDevices.filter((device) => !device.enabled).map((device) => device.id),
    capabilitiesById: Object.fromEntries(
      normalizedDevices
        .filter((device) => device.color != null)
        .map((device) => [device.id, { color: device.color }])
    )
  };
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
      devices: [],
      enabledIds: [],
      disabledIds: [],
      capabilitiesById: {}
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return buildRuntimeStateFromKnownDevices(parsed.devices);
}

export function saveKnownDevicesState({ devices = null, enabledIds = [], disabledIds = [], capabilitiesById = {} }) {
  const filePath = getKnownDevicesFilePath();
  const normalizedDevices = devices == null
    ? buildKnownDevices({
        enabledIds,
        disabledIds,
        capabilitiesById
      })
    : normalizeKnownDevices(devices);
  const payload = {
    devices: normalizedDevices
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return buildRuntimeStateFromKnownDevices(normalizedDevices);
}
