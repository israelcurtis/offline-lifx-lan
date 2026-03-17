import EventEmitter from "node:events";
import lifxLanClient from "lifx-lan-client";
import { saveControllerConfig } from "./controller-config-store.js";
import { saveKnownDevicesState } from "./known-devices-store.js";
import { listActiveLanInterfaces } from "./network-interfaces.js";
import { pickTargetLights } from "./scene-utils.js";

const { Client } = lifxLanClient;
const STATE_REFRESH_INTERVAL_MS = 2000;
const STATE_REFRESH_BUFFER_MS = 250;
const LIVE_BRIGHTNESS_TRANSITION_MS = 100;

function toPercent(value) {
  return Math.round(value * 100);
}

function normalizeBrightnessPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function getAddressGroup(address) {
  const parts = String(address ?? "").split(".");
  if (parts.length !== 4) {
    return "unknown";
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
}

function sortLights(lights) {
  return [...lights].sort((left, right) => {
    return String(left.label ?? left.id).localeCompare(String(right.label ?? right.id));
  });
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function describeLight(light) {
  return `${light.label ?? "Bulb"} (${light.id} @ ${light.address})`;
}

function invokeCommand(command) {
  return new Promise((resolve, reject) => {
    command((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function requestLightState(light) {
  return new Promise((resolve, reject) => {
    light.getState((error, state) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(state);
    });
  });
}

function normalizeLightState(state) {
  if (!state || typeof state !== "object") {
    return null;
  }

  return {
    power: state.power === 1 ? "on" : "off",
    hue: Number(state.color?.hue ?? 0),
    saturation: Number(state.color?.saturation ?? 0),
    brightness: Number(state.color?.brightness ?? 0),
    kelvin: Number(state.color?.kelvin ?? 3500),
    updatedAt: new Date().toISOString()
  };
}

function getInterfaceSignature(networks) {
  return networks
    .map((network) => `${network.name}:${network.address}/${network.netmask}`)
    .sort()
    .join("|");
}

export class LifxController extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.clientContexts = [];
    this.clientContextByClient = new Map();
    this.started = false;
    this.startPromise = null;
    this.lastAction = null;
    this.startTime = null;
    this.interfaceSignature = "";
    this.lightStateCache = new Map();
    this.stateRefreshTimer = null;
    this.stateRefreshResumeTimer = null;
    this.stateRefreshInFlight = false;
    this.sceneApplyInFlight = false;
    this.stateRefreshBlockedUntil = 0;
    this.bindEvents();
  }

  bindEvents() {
    // Interface-specific event wiring is attached when clients are created.
  }

  bindClientEvents(context) {
    context.client.on("light-new", (light) => {
      this.queueStateRefresh();
      this.emit("update", { type: "light-new", light: this.serializeLight(light) });
    });

    context.client.on("light-online", (light) => {
      this.queueStateRefresh();
      this.emit("update", { type: "light-online", light: this.serializeLight(light) });
    });

    context.client.on("light-offline", (light) => {
      const cachedState = this.lightStateCache.get(light.id);
      if (cachedState) {
        this.lightStateCache.set(light.id, {
          ...cachedState,
          power: "off",
          brightness: 0,
          updatedAt: new Date().toISOString()
        });
      }
      this.emit("update", { type: "light-offline", light: this.serializeLight(light) });
    });

    context.client.on("error", (error) => {
      this.emit("error", error);
    });
  }

  createClientContexts() {
    return listActiveLanInterfaces().map((network) => {
      const client = new Client();
      const context = {
        key: `${network.name}:${network.address}`,
        network,
        client
      };

      this.clientContextByClient.set(client, context);
      this.bindClientEvents(context);
      return context;
    });
  }

  async start() {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    const networks = listActiveLanInterfaces();
    this.interfaceSignature = getInterfaceSignature(networks);
    this.clientContexts = networks.map((network) => {
      const client = new Client();
      const context = {
        key: `${network.name}:${network.address}`,
        network,
        client
      };

      this.clientContextByClient.set(client, context);
      this.bindClientEvents(context);
      return context;
    });
    if (this.clientContexts.length === 0) {
      throw new Error("No active private IPv4 LAN interfaces were found for LIFX discovery.");
    }

    this.startPromise = Promise.all(this.clientContexts.map((context) => {
      return new Promise((resolve) => {
        context.client.init(
          {
            address: context.network.address,
            broadcast: context.network.broadcast,
            startDiscovery: true,
            messageRateLimit: 35,
            discoveryInterval: 4000
          },
          resolve
        );
      });
    }));

    await this.startPromise;
    this.started = true;
    this.startTime = new Date().toISOString();
    this.startPromise = null;
    this.startStateRefreshLoop();
    this.queueStateRefresh(true);
  }

  stop() {
    if (!this.started) {
      return;
    }

    for (const context of this.clientContexts) {
      context.client.destroy();
    }

    this.clientContexts = [];
    this.clientContextByClient.clear();
    this.interfaceSignature = "";
    this.lightStateCache.clear();
    this.stopStateRefreshLoop();
    if (this.stateRefreshResumeTimer) {
      clearTimeout(this.stateRefreshResumeTimer);
      this.stateRefreshResumeTimer = null;
    }
    this.stateRefreshBlockedUntil = 0;
    this.started = false;
    this.startPromise = null;
  }

  serializeLight(light) {
    const context = this.clientContextByClient.get(light.client);
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
      currentState: this.lightStateCache.get(light.id) ?? null
    };
  }

  startStateRefreshLoop() {
    this.stopStateRefreshLoop();
    this.stateRefreshTimer = setInterval(() => {
      this.queueStateRefresh();
    }, STATE_REFRESH_INTERVAL_MS);
  }

  stopStateRefreshLoop() {
    if (this.stateRefreshTimer) {
      clearInterval(this.stateRefreshTimer);
      this.stateRefreshTimer = null;
    }
  }

  queueStateRefresh(force = false) {
    void this.refreshLightStates(force).catch((error) => {
      console.error("Failed to refresh LIFX state cache", error);
    });
  }

  holdStateRefreshes(durationMs) {
    this.stateRefreshBlockedUntil = Date.now() + durationMs;
    if (this.stateRefreshResumeTimer) {
      clearTimeout(this.stateRefreshResumeTimer);
    }
    this.stateRefreshResumeTimer = setTimeout(() => {
      this.stateRefreshResumeTimer = null;
      this.queueStateRefresh(true);
    }, durationMs);
  }

  async refreshLightStates(force = false) {
    if (!this.started || this.stateRefreshInFlight) {
      return;
    }

    if (!force && this.sceneApplyInFlight) {
      return;
    }

    if (!force && Date.now() < this.stateRefreshBlockedUntil) {
      return;
    }

    this.stateRefreshInFlight = true;

    try {
      const onlineLights = this.getKnownLights().filter((light) => light.status === "on");
      const results = await Promise.allSettled(
        onlineLights.map(async (light) => {
          const state = await requestLightState(light);
          this.lightStateCache.set(light.id, normalizeLightState(state));
        })
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const light = onlineLights[index];
          const cachedState = this.lightStateCache.get(light.id);
          if (cachedState) {
            this.lightStateCache.set(light.id, {
              ...cachedState,
              updatedAt: new Date().toISOString()
            });
          }
        }
      });
    } finally {
      this.stateRefreshInFlight = false;
    }
  }

  hasFixedTargetSelector() {
    return (
      this.config.targetIds.length > 0 ||
      this.config.targetLabels.length > 0 ||
      this.config.targetAddresses.length > 0
    );
  }

  persistKnownDevicesState(overrides = {}) {
    const savedState = saveKnownDevicesState({
      enabledIds: this.config.enabledTargetIds,
      disabledIds: this.config.disabledTargetIds,
      ...overrides
    });

    this.config.enabledTargetIds = savedState.enabledIds;
    this.config.disabledTargetIds = savedState.disabledIds;
    return savedState;
  }

  setDeviceStates({ enabledTargetIds = [], disabledTargetIds = [] }) {
    if (this.hasFixedTargetSelector()) {
      throw new Error("Manual target selection is disabled while env-based target filters are configured.");
    }

    const enabledIdSet = new Set(enabledTargetIds);
    const savedState = this.persistKnownDevicesState({
      enabledIds: enabledTargetIds,
      disabledIds: disabledTargetIds.filter((id) => !enabledIdSet.has(id))
    });
    this.emit("update", {
      type: "device-states-updated",
      enabledTargetIds: this.config.enabledTargetIds,
      disabledTargetIds: this.config.disabledTargetIds
    });
    return {
      enabledTargetIds: savedState.enabledIds,
      disabledTargetIds: savedState.disabledIds
    };
  }

  setAddressGroupEnabledState(addressGroup, enabled) {
    if (this.hasFixedTargetSelector()) {
      throw new Error("Network group selection is disabled while env-based target filters are configured.");
    }

    const groupLights = this.getKnownLights().filter((light) => getAddressGroup(light.address) === addressGroup);
    const enabledIdSet = new Set(this.config.enabledTargetIds);
    const disabledIdSet = new Set(this.config.disabledTargetIds);

    for (const light of groupLights) {
      if (enabled) {
        enabledIdSet.add(light.id);
        disabledIdSet.delete(light.id);
      } else {
        enabledIdSet.delete(light.id);
        disabledIdSet.add(light.id);
      }
    }

    const savedState = this.persistKnownDevicesState({
      enabledIds: [...enabledIdSet],
      disabledIds: [...disabledIdSet]
    });
    this.emit("update", {
      type: "address-groups-updated",
      addressGroup,
      enabled
    });
    return {
      enabledTargetIds: savedState.enabledIds,
      disabledTargetIds: savedState.disabledIds
    };
  }

  setTransitionDurationMs(transitionDurationMs) {
    const savedConfig = saveControllerConfig({
      transitionDurationMs,
      defaultSceneKelvin: this.config.defaultSceneKelvin
    });
    this.config.transitionDurationMs = savedConfig.transitionDurationMs;
    this.config.defaultSceneKelvin = savedConfig.defaultSceneKelvin;
    console.log(`Global transition duration set to ${savedConfig.transitionDurationMs}ms.`);
    this.emit("update", {
      type: "transition-duration-updated",
      transitionDurationMs: savedConfig.transitionDurationMs
    });
    return savedConfig.transitionDurationMs;
  }

  async refreshDiscovery() {
    const latestNetworks = listActiveLanInterfaces();
    const latestSignature = getInterfaceSignature(latestNetworks);

    if (this.started && latestSignature !== this.interfaceSignature) {
      this.stop();
    }

    await this.start();
    for (const context of this.clientContexts) {
      context.client.stopDiscovery();
      context.client.startDiscovery();
    }
    await delay(this.config.discoveryWaitMs);
  }

  getKnownLights() {
    const lightsById = new Map();

    for (const context of this.clientContexts) {
      for (const light of Object.values(context.client.devices ?? {})) {
        lightsById.set(light.id, light);
      }
    }

    return sortLights([...lightsById.values()]);
  }

  syncKnownLightStates() {
    if (this.hasFixedTargetSelector()) {
      return;
    }

    const knownLights = this.getKnownLights();
    if (knownLights.length === 0) {
      return;
    }

    const enabledIdSet = new Set(this.config.enabledTargetIds);
    const disabledIdSet = new Set(this.config.disabledTargetIds);
    let changed = false;

    for (const light of knownLights) {
      if (!enabledIdSet.has(light.id) && !disabledIdSet.has(light.id)) {
        enabledIdSet.add(light.id);
        changed = true;
      }
    }

    if (changed) {
      this.persistKnownDevicesState({
        enabledIds: [...enabledIdSet],
        disabledIds: [...disabledIdSet]
      });
    }
  }

  getEnabledLights({ onlineOnly = false } = {}) {
    this.syncKnownLightStates();

    const discovered = this.getKnownLights();
    const selectedLights = this.hasFixedTargetSelector()
      ? pickTargetLights(discovered, {
          targetLabels: this.config.targetLabels,
          targetIds: this.config.targetIds,
          targetAddresses: this.config.targetAddresses
        })
      : discovered;

    const enabledIdSet = new Set(this.config.enabledTargetIds);
    const disabledIdSet = new Set(this.config.disabledTargetIds);
    const resolvedLights = selectedLights.filter((light) => {
      if (enabledIdSet.has(light.id)) {
        return true;
      }

      if (disabledIdSet.has(light.id)) {
        return false;
      }

      return true;
    });

    return sortLights(
      onlineOnly ? resolvedLights.filter((light) => light.status === "on") : resolvedLights
    );
  }

  getTargetLights() {
    return this.getEnabledLights({ onlineOnly: true });
  }

  getLiveBrightnessPercent() {
    const targetLights = this.getTargetLights();
    if (targetLights.length === 0) {
      return null;
    }

    const brightnessValues = targetLights.map((light) => {
      const currentState = this.lightStateCache.get(light.id);
      if (!currentState || currentState.power !== "on") {
        return 0;
      }

      return normalizeBrightnessPercent(currentState.brightness);
    });

    const averageBrightness = brightnessValues.reduce((sum, value) => sum + value, 0) / brightnessValues.length;
    return normalizeBrightnessPercent(averageBrightness);
  }

  getWarning() {
    const allDiscovered = this.getKnownLights();
    const enabledLights = this.getEnabledLights();

    if (this.config.targetLabels.length && enabledLights.length !== this.config.targetLabels.length) {
      return `Configured labels found ${enabledLights.length}/${this.config.targetLabels.length}.`;
    }

    if (this.config.targetIds.length && enabledLights.length !== this.config.targetIds.length) {
      return `Configured ids found ${enabledLights.length}/${this.config.targetIds.length}.`;
    }

    if (this.config.targetAddresses.length && enabledLights.length !== this.config.targetAddresses.length) {
      return `Configured addresses found ${enabledLights.length}/${this.config.targetAddresses.length}.`;
    }

    if (allDiscovered.length === 0) {
      return "No LIFX bulbs discovered yet.";
    }

    return null;
  }

  getAddressGroups(allLights, enabledIds) {
    const groups = new Map();

    for (const light of allLights) {
      const key = light.addressGroup;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: key,
          count: 0,
          onlineCount: 0,
          enabledCount: 0,
          fullyEnabled: false
        });
      }

      const group = groups.get(key);
      group.count += 1;
      if (light.status === "on") {
        group.onlineCount += 1;
      }
      if (enabledIds.has(light.id)) {
        group.enabledCount += 1;
      }
    }

    for (const group of groups.values()) {
      group.targetedCount = group.enabledCount;
      group.fullyEnabled = group.enabledCount === group.count && group.count > 0;
    }

    return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  getStatusPayload(scenes) {
    const allLights = this.getKnownLights().map((light) => this.serializeLight(light));
    const enabledIds = new Set(this.getEnabledLights().map((light) => light.id));
    const targetIds = new Set(this.getTargetLights().map((light) => light.id));

    return {
      ok: true,
      started: this.started,
      startedAt: this.startTime,
      targetLabels: this.config.targetLabels,
      targetIds: this.config.targetIds,
      targetAddresses: this.config.targetAddresses,
      enabledTargetIds: this.config.enabledTargetIds,
      disabledTargetIds: this.config.disabledTargetIds,
      transitionDurationMs: this.config.transitionDurationMs,
      defaultSceneKelvin: this.config.defaultSceneKelvin,
      liveBrightnessPercent: this.getLiveBrightnessPercent(),
      manualTargetingEnabled: !this.hasFixedTargetSelector(),
      interfaces: this.clientContexts.map((context) => ({
        name: context.network.name,
        address: context.network.address,
        cidr: context.network.cidr,
        broadcast: context.network.broadcast
      })),
      addressGroups: this.getAddressGroups(allLights, enabledIds),
      discoveredCount: allLights.length,
      onlineCount: allLights.filter((light) => light.status === "on").length,
      targetedCount: enabledIds.size,
      warning: this.getWarning(),
      lastAction: this.lastAction,
      scenes,
      lights: allLights.map((light) => ({
        ...light,
        enabled: enabledIds.has(light.id),
        targeted: targetIds.has(light.id)
      }))
    };
  }

  reconcileSceneUpdate(previousSceneId, scene) {
    if (this.lastAction?.sceneId !== previousSceneId) {
      return;
    }

    this.lastAction = {
      ...this.lastAction,
      sceneId: scene.id,
      sceneName: scene.name
    };
  }

  async applyScene(scene) {
    const targetLights = this.getTargetLights();
    if (targetLights.length === 0) {
      throw new Error("No target bulbs are currently online.");
    }

    const durationMs = this.config.transitionDurationMs;
    const failures = [];
    this.sceneApplyInFlight = true;

    try {
      if (scene.power === "off") {
        const offResults = await Promise.allSettled(
          targetLights.map((light) =>
            invokeCommand((callback) => {
              light.off(durationMs, callback);
            })
          )
        );

        offResults.forEach((result, index) => {
          if (result.status === "rejected") {
            failures.push({
              id: targetLights[index].id,
              label: targetLights[index].label ?? null,
              address: targetLights[index].address,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        });
      } else {
        const results = await Promise.allSettled(
          targetLights.map(async (light) => {
            const state = await requestLightState(light);
            const targetBrightness = toPercent(scene.brightness);

            if (state?.power === 1) {
              await invokeCommand((callback) => {
                light.color(
                  scene.hue,
                  toPercent(scene.saturation),
                  targetBrightness,
                  scene.kelvin,
                  durationMs,
                  callback
                );
              });
            } else {
              await invokeCommand((callback) => {
                light.color(
                  scene.hue,
                  toPercent(scene.saturation),
                  1,
                  scene.kelvin,
                  0,
                  callback
                );
              });

              await invokeCommand((callback) => {
                light.on(0, callback);
              });

              await invokeCommand((callback) => {
                light.color(
                  scene.hue,
                  toPercent(scene.saturation),
                  targetBrightness,
                  scene.kelvin,
                  durationMs,
                  callback
                );
              });
            }
          })
        );

        results.forEach((result, index) => {
          if (result.status === "rejected") {
            failures.push({
              id: targetLights[index].id,
              label: targetLights[index].label ?? null,
              address: targetLights[index].address,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        });
      }
    } finally {
      this.sceneApplyInFlight = false;
    }

    this.lastAction = {
      sceneId: scene.id,
      sceneName: scene.name,
      appliedAt: new Date().toISOString(),
      targetedCount: targetLights.length,
      successCount: targetLights.length - failures.length,
      failures
    };

    if (failures.length > 0) {
      console.warn(
        `Scene ${scene.id} completed with ${failures.length} failure(s): ${failures
          .map((failure) => describeLight(failure))
          .join(", ")}`
      );
    } else {
      console.log(`Scene ${scene.id} applied to ${targetLights.length} bulb(s).`);
    }

    this.emit("update", { type: "scene-applied", lastAction: this.lastAction });
    this.holdStateRefreshes(durationMs + STATE_REFRESH_BUFFER_MS);
    return this.lastAction;
  }

  async setLiveBrightnessPercent(brightnessPercent) {
    const targetLights = this.getTargetLights();
    if (targetLights.length === 0) {
      throw new Error("No target bulbs are currently online.");
    }

    const normalizedBrightness = normalizeBrightnessPercent(brightnessPercent);
    const failures = [];

    const results = await Promise.allSettled(
      targetLights.map(async (light) => {
        const cachedState = this.lightStateCache.get(light.id);
        const state = cachedState?.power === "on"
          ? cachedState
          : normalizeLightState(await requestLightState(light)) ?? cachedState ?? {
          power: "off",
          hue: 0,
          saturation: 0,
          brightness: 0,
          kelvin: 3500,
          updatedAt: new Date().toISOString()
        };

        if (normalizedBrightness === 0) {
          if (state.power === "on") {
            await invokeCommand((callback) => {
              light.off(LIVE_BRIGHTNESS_TRANSITION_MS, callback);
            });
          }

          this.lightStateCache.set(light.id, {
            ...state,
            power: "off",
            brightness: 0,
            updatedAt: new Date().toISOString()
          });
          return;
        }

        const nextBrightness = Math.max(1, normalizedBrightness);

        if (state.power !== "on") {
          await invokeCommand((callback) => {
            light.color(
              state.hue,
              state.saturation,
              1,
              state.kelvin,
              0,
              callback
            );
          });

          await invokeCommand((callback) => {
            light.on(0, callback);
          });
        }

        await invokeCommand((callback) => {
          light.color(
            state.hue,
            state.saturation,
            nextBrightness,
            state.kelvin,
            LIVE_BRIGHTNESS_TRANSITION_MS,
            callback
          );
        });

        this.lightStateCache.set(light.id, {
          ...state,
          power: "on",
          brightness: nextBrightness,
          updatedAt: new Date().toISOString()
        });
      })
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failures.push({
          id: targetLights[index].id,
          label: targetLights[index].label ?? null,
          address: targetLights[index].address,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    });

    if (failures.length > 0) {
      console.warn(
        `Live brightness update completed with ${failures.length} failure(s): ${failures
          .map((failure) => describeLight(failure))
          .join(", ")}`
      );
    }

    this.holdStateRefreshes(350);
    this.emit("update", {
      type: "live-brightness-updated",
      brightnessPercent: normalizedBrightness,
      targetedCount: targetLights.length,
      successCount: targetLights.length - failures.length,
      failures
    });

    return {
      brightnessPercent: normalizedBrightness,
      targetedCount: targetLights.length,
      successCount: targetLights.length - failures.length,
      failures
    };
  }
}
