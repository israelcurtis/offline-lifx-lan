import lifxLanClient from "lifx-lan-client";
import { listActiveLanInterfaces } from "./network-interfaces.js";
import { sortLights } from "./domain-utils.js";

const { Client } = lifxLanClient;

export function getInterfaceSignature(networks) {
  return networks
    .map((network) => `${network.name}:${network.address}/${network.netmask}`)
    .sort()
    .join("|");
}

export class LifxClientRegistry {
  constructor({ onLightNew = () => {}, onLightOnline = () => {}, onLightOffline = () => {}, onError = () => {} } = {}) {
    this.onLightNew = onLightNew;
    this.onLightOnline = onLightOnline;
    this.onLightOffline = onLightOffline;
    this.onError = onError;
    this.clientContexts = [];
    this.clientContextByClient = new Map();
    this.interfaceSignature = "";
  }

  getInterfaceSignature() {
    return this.interfaceSignature;
  }

  getContexts() {
    return this.clientContexts;
  }

  getContextForClient(client) {
    return this.clientContextByClient.get(client);
  }

  async start() {
    const networks = listActiveLanInterfaces();
    this.interfaceSignature = getInterfaceSignature(networks);
    this.clientContexts = networks.map((network) => this.createClientContext(network));

    if (this.clientContexts.length === 0) {
      throw new Error("No active private IPv4 LAN interfaces were found for LIFX discovery.");
    }

    await Promise.all(this.clientContexts.map((context) => {
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
  }

  stop() {
    for (const context of this.clientContexts) {
      context.client.destroy();
    }

    this.clientContexts = [];
    this.clientContextByClient.clear();
    this.interfaceSignature = "";
  }

  restartDiscovery() {
    for (const context of this.clientContexts) {
      context.client.stopDiscovery();
      context.client.startDiscovery();
    }
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

  createClientContext(network) {
    const client = new Client();
    const context = {
      key: `${network.name}:${network.address}`,
      network,
      client
    };

    this.clientContextByClient.set(client, context);
    this.bindClientEvents(context);
    return context;
  }

  bindClientEvents(context) {
    context.client.on("light-new", (light) => {
      this.onLightNew(light, context);
    });

    context.client.on("light-online", (light) => {
      this.onLightOnline(light, context);
    });

    context.client.on("light-offline", (light) => {
      this.onLightOffline(light, context);
    });

    context.client.on("error", (error) => {
      this.onError(error, context);
    });
  }
}
