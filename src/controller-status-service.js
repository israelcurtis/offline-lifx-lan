import { getAddressGroup } from "./domain-utils.js";
import { buildAddressGroups, decorateLightsWithTargetState } from "./status-model.js";

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
    discoveredCount: allLights.length,
    onlineCount: allLights.filter((light) => light.status === "on").length,
    targetedCount: enabledIds.size,
    warning,
    lastAction,
    scenes,
    lights: decorateLightsWithTargetState(allLights, enabledIds, targetIds)
  };
}
