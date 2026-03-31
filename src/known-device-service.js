import { saveKnownDevicesState } from "./known-devices-store.js";
import { getAddressGroup } from "./domain-utils.js";
import { requestLightHardwareVersion } from "./lifx-command-utils.js";
import { createKnownDeviceLookup, getKnownDeviceRecord, mergeKnownDeviceRecords } from "./known-device-model.js";

export class KnownDeviceService {
  constructor(config) {
    this.config = config;
  }

  getDevices() {
    return this.config.knownDevices ?? [];
  }

  hasFixedTargetSelector() {
    return (
      this.config.targetIds.length > 0
      || this.config.targetLabels.length > 0
      || this.config.targetAddresses.length > 0
    );
  }

  persist(overrides = {}) {
    const savedState = saveKnownDevicesState({
      devices: this.getDevices(),
      ...overrides
    });

    this.config.knownDevices = savedState.devices;
    return savedState;
  }

  getRecord(lightId) {
    return getKnownDeviceRecord(this.getDevices(), lightId);
  }

  syncDiscoveredLights(lights) {
    if (this.hasFixedTargetSelector() || lights.length === 0) {
      return null;
    }

    let changed = false;
    const knownDevicesById = createKnownDeviceLookup(this.getDevices());

    for (const light of lights) {
      if (!knownDevicesById.has(light.id)) {
        knownDevicesById.set(light.id, { id: light.id, enabled: true });
        changed = true;
      }
    }

    if (!changed) {
      return null;
    }

    return this.persist({ devices: [...knownDevicesById.values()] });
  }

  replaceWithDiscoveredLights(lights) {
    if (this.hasFixedTargetSelector()) {
      return null;
    }

    const previousDevicesById = createKnownDeviceLookup(this.getDevices());
    const nextDevicesById = new Map();

    for (const light of lights) {
      const existingRecord = previousDevicesById.get(light.id) ?? { id: light.id, enabled: true };
      nextDevicesById.set(light.id, existingRecord);
    }

    return this.persist({ devices: [...nextDevicesById.values()] });
  }

  async refreshCapabilities(lights) {
    const knownDevicesById = createKnownDeviceLookup(this.getDevices());
    const lightsNeedingCapabilities = lights.filter((light) => knownDevicesById.get(light.id)?.color == null);
    if (lightsNeedingCapabilities.length === 0) {
      return null;
    }

    const results = await Promise.allSettled(
      lightsNeedingCapabilities.map(async (light) => {
        const hardwareInfo = await requestLightHardwareVersion(light);
        return {
          id: light.id,
          color: Boolean(hardwareInfo?.productFeatures?.color)
        };
      })
    );

    let changed = false;
    for (const result of results) {
      if (result.status !== "fulfilled") {
        continue;
      }

      const existingRecord = knownDevicesById.get(result.value.id) ?? { id: result.value.id, enabled: true };
      knownDevicesById.set(result.value.id, {
        ...existingRecord,
        color: result.value.color
      });
      changed = true;
    }

    if (!changed) {
      return null;
    }

    return this.persist({ devices: [...knownDevicesById.values()] });
  }

  setDeviceStates({ devices = [] }) {
    if (this.hasFixedTargetSelector()) {
      throw new Error("Manual target selection is disabled while env-based target filters are configured.");
    }

    return this.persist({
      devices: mergeKnownDeviceRecords(this.getDevices(), devices)
    });
  }

  setAddressGroupEnabledState(addressGroup, lights, enabled) {
    if (this.hasFixedTargetSelector()) {
      throw new Error("Network group selection is disabled while env-based target filters are configured.");
    }

    return this.persist({
      devices: mergeKnownDeviceRecords(
        this.getDevices(),
        lights
          .filter((light) => getAddressGroup(light.address) === addressGroup)
          .map((light) => ({
            id: light.id,
            enabled
          }))
      )
    });
  }
}
