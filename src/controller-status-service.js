import os from "node:os";
import fs from "node:fs";
import { getAddressGroup } from "./domain-utils.js";
import { buildAddressGroups, decorateLightsWithTargetState } from "./status-model.js";

function toRoundedMb(bytes) {
  return Math.round((Number(bytes) / (1024 * 1024)) * 10) / 10;
}

function readBytesIfPresent(filePath) {
  try {
    const rawValue = fs.readFileSync(filePath, "utf8").trim();
    if (!rawValue || rawValue === "max") {
      return Number.POSITIVE_INFINITY;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  } catch {
    return null;
  }
}

function resolveContainerMemoryPaths() {
  const cgroupV2LimitPath = "/sys/fs/cgroup/memory.max";
  const cgroupV2CurrentPath = "/sys/fs/cgroup/memory.current";
  const cgroupV1LimitPath = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
  const cgroupV1CurrentPath = "/sys/fs/cgroup/memory/memory.usage_in_bytes";

  if (fs.existsSync(cgroupV2LimitPath) && fs.existsSync(cgroupV2CurrentPath)) {
    return {
      limitPath: cgroupV2LimitPath,
      currentPath: cgroupV2CurrentPath
    };
  }

  if (fs.existsSync(cgroupV1LimitPath) && fs.existsSync(cgroupV1CurrentPath)) {
    return {
      limitPath: cgroupV1LimitPath,
      currentPath: cgroupV1CurrentPath
    };
  }

  return null;
}

const containerMemoryPaths = resolveContainerMemoryPaths();

function readContainerMemoryUsage() {
  if (!containerMemoryPaths) {
    return null;
  }

  const limitBytes = readBytesIfPresent(containerMemoryPaths.limitPath);
  const currentBytes = readBytesIfPresent(containerMemoryPaths.currentPath);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0 || !Number.isFinite(currentBytes) || currentBytes < 0) {
    return null;
  }

  const hostTotalBytes = os.totalmem();
  if (limitBytes >= hostTotalBytes) {
    return null;
  }

  return {
    currentMb: toRoundedMb(currentBytes),
    availableMb: toRoundedMb(Math.max(0, limitBytes - currentBytes)),
    limitMb: toRoundedMb(limitBytes)
  };
}

function buildServerMemory(config) {
  const usage = process.memoryUsage();
  const warningThresholdMb = Number.isFinite(config.memoryWarningRssMb)
    ? Math.max(1, Math.round(config.memoryWarningRssMb))
    : 256;
  const rssMb = toRoundedMb(usage.rss);
  const containerMemory = readContainerMemoryUsage();

  return {
    rssMb,
    heapUsedMb: toRoundedMb(usage.heapUsed),
    heapTotalMb: toRoundedMb(usage.heapTotal),
    externalMb: toRoundedMb(usage.external),
    arrayBuffersMb: toRoundedMb(usage.arrayBuffers ?? 0),
    warningThresholdMb,
    pressure: rssMb >= warningThresholdMb ? "high" : "normal",
    memoryScope: containerMemory ? "container" : "system",
    availableMb: containerMemory ? containerMemory.availableMb : toRoundedMb(os.freemem()),
    limitMb: containerMemory ? containerMemory.limitMb : toRoundedMb(os.totalmem()),
    usageMb: containerMemory ? containerMemory.currentMb : null
  };
}

function buildWarningMessage(primaryWarning, serverMemory) {
  const warnings = [];
  if (primaryWarning) {
    warnings.push(primaryWarning);
  }

  if (serverMemory.pressure === "high") {
    warnings.push(
      `Server memory is high: RSS ${serverMemory.rssMb} MB / ${serverMemory.warningThresholdMb} MB threshold.`
    );
  }

  return warnings.length > 0 ? warnings.join(" ") : null;
}

export function serializeLight(light, { context, knownDevice, currentState }) {
  return {
    id: light.id,
    label: light.label ?? "Unnamed bulb",
    address: light.address,
    addressGroup: getAddressGroup(light.address),
    port: light.port,
    status: light.status,
    interfaceName: context?.network.name ?? "unknown",
    controllerAddress: context?.network.address ?? null,
    subnetCidr: context?.network.cidr ?? null,
    capabilities: knownDevice.capabilities,
    currentState
  };
}

export function buildStatusPayload({
  started,
  startedAt,
  config,
  knownDevices,
  liveBrightnessPercent,
  manualTargetingEnabled,
  interfaces,
  allLights,
  enabledIds,
  targetIds,
  warning,
  lastAction,
  scenes
}) {
  const serverMemory = buildServerMemory(config);
  const discoveredCount = Array.isArray(knownDevices) ? knownDevices.length : 0;

  return {
    ok: true,
    started,
    startedAt,
    targetLabels: config.targetLabels,
    targetIds: config.targetIds,
    targetAddresses: config.targetAddresses,
    knownDevices,
    transitionDurationMs: config.transitionDurationMs,
    defaultSceneKelvin: config.defaultSceneKelvin,
    liveBrightnessPercent,
    manualTargetingEnabled,
    interfaces,
    addressGroups: buildAddressGroups(allLights, enabledIds),
    discoveredCount,
    onlineCount: allLights.filter((light) => light.status === "on").length,
    targetedCount: enabledIds.size,
    warning: buildWarningMessage(warning, serverMemory),
    serverMemory,
    lastAction,
    scenes,
    lights: decorateLightsWithTargetState(allLights, enabledIds, targetIds)
  };
}
