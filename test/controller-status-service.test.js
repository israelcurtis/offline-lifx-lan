import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStatusPayload } from "../src/controller-status-service.js";

test("buildStatusPayload reports discoveredCount from persisted known devices", () => {
  const payload = buildStatusPayload({
    started: true,
    startedAt: null,
    config: {
      targetLabels: [],
      targetIds: [],
      targetAddresses: [],
      transitionDurationMs: 1600,
      defaultSceneKelvin: 4000,
      memoryWarningRssMb: 160
    },
    knownDevices: [
      { id: "bulb-a", enabled: true, color: true },
      { id: "bulb-b", enabled: true, color: true },
      { id: "bulb-c", enabled: false, color: false }
    ],
    liveBrightnessPercent: 100,
    manualTargetingEnabled: true,
    interfaces: [],
    allLights: [
      {
        id: "bulb-a",
        label: "Bulb A",
        address: "192.168.1.10",
        addressGroup: "192.168.1.x",
        port: 56700,
        status: "on",
        enabled: true,
        targeted: true,
        capabilities: { color: true },
        currentState: null
      },
      {
        id: "bulb-b",
        label: "Bulb B",
        address: "192.168.1.11",
        addressGroup: "192.168.1.x",
        port: 56700,
        status: "off",
        enabled: true,
        targeted: true,
        capabilities: { color: true },
        currentState: null
      }
    ],
    enabledIds: new Set(["bulb-a", "bulb-b"]),
    targetIds: new Set(["bulb-a", "bulb-b"]),
    warning: null,
    lastAction: null,
    scenes: []
  });

  assert.equal(payload.discoveredCount, 3);
  assert.equal(payload.onlineCount, 1);
  assert.ok(payload.serverMemory);
  assert.equal(typeof payload.serverMemory.availableMb, "number");
  assert.equal(typeof payload.serverMemory.limitMb, "number");
  assert.ok(["system", "container"].includes(payload.serverMemory.memoryScope));
});
