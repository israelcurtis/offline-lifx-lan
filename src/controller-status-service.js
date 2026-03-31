import os from "node:os";
import { getAddressGroup } from "./domain-utils.js";
import { buildAddressGroups, decorateLightsWithTargetState } from "./status-model.js";

function toRoundedMb(bytes) {
  return Math.round((Number(bytes) / (1024 * 1024)) * 10) / 10;
}

function buildServerMemory(config) {
  const usage = process.memoryUsage();
  const totalSystemMb = toRoundedMb(os.totalmem());
  const freeSystemMb = toRoundedMb(os.freemem());
  const warningThresholdMb = Number.isFinite(config.memoryWarningRssMb)
    ? Math.max(1, Math.round(config.memoryWarningRssMb))
    : 256;
  const rssMb = toRoundedMb(usage.rss);

  return {
    rssMb,
    totalSystemMb,
    freeSystemMb,
    heapUsedMb: toRoundedMb(usage.heapUsed),
    heapTotalMb: toRoundedMb(usage.heapTotal),
    externalMb: toRoundedMb(usage.external),
    arrayBuffersMb: toRoundedMb(usage.arrayBuffers ?? 0),
    warningThresholdMb,
    pressure: rssMb >= warningThresholdMb ? "high" : "normal"
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
