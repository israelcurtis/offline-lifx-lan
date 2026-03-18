export function normalizeKnownDeviceRecord(device) {
  if (!device || typeof device !== "object" || Array.isArray(device)) {
    return null;
  }

  const id = String(device.id ?? "").trim();
  if (!id) {
    return null;
  }

  const normalized = {
    id,
    enabled: device.enabled !== false
  };

  if (device.color != null) {
    normalized.color = Boolean(device.color);
  }

  return normalized;
}

export function normalizeKnownDevices(devices) {
  if (!Array.isArray(devices)) {
    return [];
  }

  const normalizedById = new Map();
  for (const device of devices) {
    const normalized = normalizeKnownDeviceRecord(device);
    if (normalized) {
      normalizedById.set(normalized.id, normalized);
    }
  }

  return [...normalizedById.values()];
}

export function createKnownDeviceLookup(devices) {
  return new Map(normalizeKnownDevices(devices).map((device) => [device.id, device]));
}

export function mergeKnownDeviceRecords(existingDevices, nextDevices) {
  const mergedById = createKnownDeviceLookup(existingDevices);

  for (const device of Array.isArray(nextDevices) ? nextDevices : []) {
    const normalized = normalizeKnownDeviceRecord(device);
    if (!normalized) {
      continue;
    }

    const existing = mergedById.get(normalized.id) ?? { id: normalized.id, enabled: true };
    mergedById.set(normalized.id, {
      ...existing,
      ...normalized
    });
  }

  return [...mergedById.values()];
}

export function buildKnownDevicesState(devices) {
  const normalizedDevices = normalizeKnownDevices(devices);

  return {
    devices: normalizedDevices,
    enabledIds: normalizedDevices.filter((device) => device.enabled).map((device) => device.id),
    disabledIds: normalizedDevices.filter((device) => !device.enabled).map((device) => device.id),
    capabilitiesById: Object.fromEntries(
      normalizedDevices
        .filter((device) => device.color != null)
        .map((device) => [device.id, { color: device.color }])
    )
  };
}

export function getKnownDeviceRecord(devices, id) {
  const record = createKnownDeviceLookup(devices).get(id);

  return {
    id,
    enabled: record?.enabled ?? true,
    capabilities: record?.color == null ? null : { color: record.color }
  };
}
