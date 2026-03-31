import EventEmitter from "node:events";
import { saveControllerConfig } from "./controller-config-store.js";
import { delay } from "./lifx-command-utils.js";
import { KnownDeviceService } from "./known-device-service.js";
import { LightStateService } from "./light-state-service.js";
import { LifxClientRegistry, getInterfaceSignature } from "./lifx-client-registry.js";
import { LifxCommandRunner } from "./lifx-command-runner.js";
import { listActiveLanInterfaces } from "./network-interfaces.js";
import { normalizeBrightnessPercent, pickTargetLights } from "./domain-utils.js";
import { buildStatusPayload, serializeLight } from "./controller-status-service.js";

export class LifxController extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.started = false;
    this.startPromise = null;
    this.lastAction = null;
    this.startTime = null;

    // Keep the controller API stable, but move the cohesive responsibilities behind
    // smaller services so future work can extend discovery, polling, and command logic
    // without re-expanding this file into one monolith again.
    this.knownDeviceService = new KnownDeviceService(config);
    this.clientRegistry = new LifxClientRegistry({
      onLightNew: (light) => this.handleLightDiscovered("light-new", light),
      onLightOnline: (light) => this.handleLightDiscovered("light-online", light),
      onLightOffline: (light) => this.handleLightOffline(light),
      onError: (error) => this.emit("error", error)
    });
    this.lightStateService = new LightStateService({
      getLights: () => this.getKnownLights(),
      isStarted: () => this.started,
      isSceneApplyInFlight: () => this.commandRunner.isSceneApplyInFlight(),
      onRefreshError: (error) => {
        console.error("Failed to refresh LIFX state cache", error);
      }
    });
    this.commandRunner = new LifxCommandRunner({
      getTargetLights: () => this.getTargetLights(),
      getDefaultSceneKelvin: () => this.config.defaultSceneKelvin,
      getTransitionDurationMs: () => this.config.transitionDurationMs,
      stateService: this.lightStateService,
      onSceneApplied: (lastAction) => {
        this.lastAction = lastAction;
        this.emit("update", { type: "scene-applied", lastAction });
      },
      onBrightnessUpdated: (payload) => {
        this.emit("update", {
          type: "live-brightness-updated",
          ...payload
        });
      }
    });
  }

  handleLightDiscovered(type, light) {
    this.lightStateService.queueRefresh();
    this.emit("update", { type, light: this.serializeLight(light) });
  }

  handleLightOffline(light) {
    this.lightStateService.markOffline(light.id);
    this.emit("update", { type: "light-offline", light: this.serializeLight(light) });
  }

  serializeLight(light) {
    const context = this.clientRegistry.getContextForClient(light.client);
    const knownDevice = this.getKnownDeviceRecord(light.id);

    return serializeLight(light, {
      context,
      knownDevice,
      currentState: this.lightStateService.get(light.id)
    });
  }

  getKnownDevices() {
    return this.knownDeviceService.getDevices();
  }

  hasFixedTargetSelector() {
    return this.knownDeviceService.hasFixedTargetSelector();
  }

  getKnownDeviceRecord(lightId) {
    return this.knownDeviceService.getRecord(lightId);
  }

  async start() {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      await this.clientRegistry.start();
      this.started = true;
      this.startTime = new Date().toISOString();
      this.lightStateService.startRefreshLoop();
      this.lightStateService.queueRefresh(true);
      void this.refreshDiscoveredMetadata({ waitMs: this.config.discoveryWaitMs });
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.clientRegistry.stop();
    this.lightStateService.stop();
    this.started = false;
    this.startPromise = null;
  }

  getKnownLights() {
    return this.clientRegistry.getKnownLights();
  }

  syncKnownLightStates() {
    this.knownDeviceService.syncDiscoveredLights(this.getKnownLights());
  }

  rebuildKnownLightStates() {
    this.knownDeviceService.replaceWithDiscoveredLights(this.getKnownLights());
  }

  async refreshKnownLightCapabilities() {
    await this.knownDeviceService.refreshCapabilities(this.getKnownLights());
  }

  async refreshDiscoveredMetadata({ waitMs = 0 } = {}) {
    try {
      if (waitMs > 0) {
        await delay(waitMs);
      }

      this.syncKnownLightStates();
      await this.refreshKnownLightCapabilities();
    } catch (error) {
      console.warn("Failed to refresh LIFX discovery metadata", error);
    }
  }

  setDeviceStates({ devices = [] }) {
    const savedState = this.knownDeviceService.setDeviceStates({ devices });
    this.emit("update", {
      type: "device-states-updated",
      knownDevices: savedState.devices
    });
    return {
      knownDevices: savedState.devices
    };
  }

  setAddressGroupEnabledState(addressGroup, enabled) {
    const savedState = this.knownDeviceService.setAddressGroupEnabledState(addressGroup, this.getKnownLights(), enabled);
    this.emit("update", {
      type: "address-groups-updated",
      addressGroup,
      enabled
    });
    return {
      knownDevices: savedState.devices
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

  resetState({ controllerConfig, knownDevices }) {
    this.config.transitionDurationMs = controllerConfig.transitionDurationMs;
    this.config.defaultSceneKelvin = controllerConfig.defaultSceneKelvin;
    this.config.knownDevices = knownDevices;
    this.lastAction = null;
    this.lightStateService.clear();
    this.emit("update", { type: "state-reset" });
  }

  async refreshDiscovery() {
    const latestSignature = getInterfaceSignature(listActiveLanInterfaces());

    if (this.started && latestSignature !== this.clientRegistry.getInterfaceSignature()) {
      this.stop();
    }

    await this.start();
    this.clientRegistry.restartDiscovery();
    await delay(this.config.discoveryWaitMs);
    this.rebuildKnownLightStates();
    await this.refreshKnownLightCapabilities();
  }

  async resetDiscovery() {
    this.stop();
    await this.start();
    await delay(this.config.discoveryWaitMs);
    await this.refreshDiscoveredMetadata();
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

    const resolvedLights = selectedLights.filter((light) => this.getKnownDeviceRecord(light.id).enabled);
    return onlineOnly ? resolvedLights.filter((light) => light.status === "on") : resolvedLights;
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
      const currentState = this.lightStateService.get(light.id);
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

  getStatusPayload(scenes) {
    const allLights = this.getKnownLights().map((light) => this.serializeLight(light));
    const enabledIds = new Set(this.getEnabledLights().map((light) => light.id));
    const targetIds = new Set(this.getTargetLights().map((light) => light.id));

    return buildStatusPayload({
      started: this.started,
      startedAt: this.startTime,
      config: this.config,
      knownDevices: this.getKnownDevices(),
      liveBrightnessPercent: this.getLiveBrightnessPercent(),
      manualTargetingEnabled: !this.hasFixedTargetSelector(),
      interfaces: this.clientRegistry.getContexts().map((context) => ({
        name: context.network.name,
        address: context.network.address,
        cidr: context.network.cidr,
        broadcast: context.network.broadcast
      })),
      allLights,
      enabledIds,
      targetIds,
      warning: this.getWarning(),
      lastAction: this.lastAction,
      scenes
    });
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
    return this.commandRunner.applyScene(scene);
  }

  async previewScene(scene) {
    return this.commandRunner.previewScene(scene);
  }

  async setLiveBrightnessPercent(brightnessPercent) {
    return this.commandRunner.setLiveBrightnessPercent(brightnessPercent);
  }
}
