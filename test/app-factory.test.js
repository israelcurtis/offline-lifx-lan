import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { appRootDir } from "../src/app-paths.js";
import { createApp } from "../src/app-factory.js";

const tempPaths = new Set();
const originalScenesPath = process.env.SCENES_PATH;
const originalControllerConfigPath = process.env.CONTROLLER_CONFIG_PATH;
const originalKnownDevicesPath = process.env.KNOWN_DEVICES_PATH;

afterEach(async () => {
  if (originalScenesPath === undefined) {
    delete process.env.SCENES_PATH;
  } else {
    process.env.SCENES_PATH = originalScenesPath;
  }

  if (originalControllerConfigPath === undefined) {
    delete process.env.CONTROLLER_CONFIG_PATH;
  } else {
    process.env.CONTROLLER_CONFIG_PATH = originalControllerConfigPath;
  }

  if (originalKnownDevicesPath === undefined) {
    delete process.env.KNOWN_DEVICES_PATH;
  } else {
    process.env.KNOWN_DEVICES_PATH = originalKnownDevicesPath;
  }

  for (const targetPath of tempPaths) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  tempPaths.clear();
});

function makeTempScenesPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-app-factory-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "scenes.json");
}

function makeTempOptionsPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-app-factory-options-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "options.json");
}

function makeTempKnownDevicesPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-app-factory-known-devices-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "known-devices.json");
}

function createMockResponse(finish) {
  return {
    statusCode: 200,
    headers: {},
    locals: {},
    finished: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.finished = true;
      finish({
        statusCode: this.statusCode,
        body: payload,
        headers: this.headers
      });
      return this;
    },
    end(payload) {
      this.finished = true;
      finish({
        statusCode: this.statusCode,
        body: payload,
        headers: this.headers
      });
      return this;
    }
  };
}

async function invokeApp(app, { method = "GET", url = "/", body } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };
    const req = {
      method,
      url,
      originalUrl: url,
      body,
      headers: {},
      socket: {
        remoteAddress: "127.0.0.1"
      }
    };
    const res = createMockResponse(finish);

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      setImmediate(() => {
        if (res.finished) {
          return;
        }

        finish({
          statusCode: res.statusCode,
          body: undefined,
          headers: res.headers
        });
      });
    });
  });
}

function buildTestApp({ controllerOverrides = {}, configOverrides = {}, scenes } = {}) {
  const controller = {
    appliedScenes: [],
    previewScenes: [],
    knownDevices: [{ id: "a", enabled: true, color: true }],
    reconcileSceneUpdateCalls: [],
    getStatusPayload(currentScenes) {
      return {
        ok: true,
        started: true,
        startedAt: null,
        targetLabels: [],
        targetIds: [],
        targetAddresses: [],
        knownDevices: this.knownDevices,
        transitionDurationMs: 1000,
        defaultSceneKelvin: 5500,
        liveBrightnessPercent: 50,
        manualTargetingEnabled: true,
        interfaces: [],
        addressGroups: [],
        discoveredCount: 1,
        onlineCount: 1,
        targetedCount: this.knownDevices.filter((device) => device.enabled).length,
        warning: null,
        lastAction: null,
        scenes: currentScenes,
        lights: [
          {
            id: "a",
            label: "Bulb A",
            address: "10.0.0.2",
            addressGroup: "10.0.0.x",
            status: "on",
            enabled: this.knownDevices.find((device) => device.id === "a")?.enabled ?? true,
            targeted: this.knownDevices.find((device) => device.id === "a")?.enabled ?? true,
            capabilities: { color: true },
            currentState: {
              power: "on",
              hue: 120,
              saturation: 100,
              brightness: 60,
              kelvin: 5500,
              updatedAt: new Date().toISOString()
            }
          }
        ]
      };
    },
    async applyScene(scene) {
      this.appliedScenes.push(scene);
      return { sceneId: scene.id, sceneName: scene.name };
    },
    async previewScene(scene) {
      this.previewScenes.push(scene);
      return { ok: true };
    },
    async refreshDiscovery() {
      this.refreshDiscoveryCalls = (this.refreshDiscoveryCalls ?? 0) + 1;
    },
    async resetDiscovery() {
      this.resetDiscoveryCalls = (this.resetDiscoveryCalls ?? 0) + 1;
    },
    resetState({ controllerConfig, knownDevices }) {
      this.knownDevices = knownDevices;
      this.resetStateCalls = this.resetStateCalls ?? [];
      this.resetStateCalls.push({ controllerConfig, knownDevices });
    },
    setDeviceStates({ devices }) {
      this.knownDevices = devices;
    },
    setAddressGroupEnabledState() {},
    setTransitionDurationMs() {},
    reconcileSceneUpdate(previousSceneId, scene) {
      this.reconcileSceneUpdateCalls.push({ previousSceneId, scene });
    },
    ...controllerOverrides
  };

  const config = {
    port: 0,
    host: "127.0.0.1",
    discoveryWaitMs: 0,
    targetLabels: [],
    targetIds: [],
    targetAddresses: [],
    knownDevices: [{ id: "a", enabled: true, color: true }],
    transitionDurationMs: 1000,
    defaultSceneKelvin: 5500,
    scenes: scenes ?? [],
    ...configOverrides
  };

  const { app } = createApp({
    controller,
    config,
    scenes: scenes ?? [
      {
        id: "focus",
        name: "Focus",
        description: "Bright white",
        power: "on",
        hue: 120,
        saturation: 0,
        brightness: 0.8,
        kelvin: 5500
      }
    ],
    rootDir: process.cwd()
  });

  return {
    controller,
    app
  };
}

test("GET /api/status returns the controller status payload", async () => {
  const { app } = buildTestApp();
  const response = await invokeApp(app, { method: "GET", url: "/api/status" });

  assert.equal(response.statusCode, 200);
  const payload = response.body;
  assert.equal(payload.ok, true);
  assert.equal(payload.scenes[0].id, "focus");
  assert.equal(payload.knownDevices[0].id, "a");
});

test("POST /api/targets accepts device records", async () => {
  const { app, controller } = buildTestApp();
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/targets",
    body: {
      devices: [{ id: "a", enabled: false, color: true }]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(controller.knownDevices, [{ id: "a", enabled: false, color: true }]);
});

test("POST /api/scene-preview normalizes the preview payload before passing it to the controller", async () => {
  const { app, controller } = buildTestApp();
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/scene-preview",
    body: {
      power: "on",
      hue: 480,
      saturation: 2,
      brightness: -1,
      kelvin: 20000
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(controller.previewScenes[0], {
    power: "on",
    hue: 360,
    saturation: 1,
    brightness: 0,
    kelvin: 9000
  });
});

test("PUT /api/scenes/:sceneId persists scenes through the factory route", async () => {
  process.env.SCENES_PATH = makeTempScenesPath();
  const initialScenes = [
    {
      id: "focus",
      name: "Focus",
      description: "Bright white",
      power: "on",
      hue: 120,
      saturation: 0,
      brightness: 0.8,
      kelvin: 5500
    }
  ];
  fs.writeFileSync(process.env.SCENES_PATH, `${JSON.stringify(initialScenes, null, 2)}\n`, "utf8");

  const { app, controller } = buildTestApp({ scenes: initialScenes });
  const response = await invokeApp(app, {
    method: "PUT",
    url: "/api/scenes/focus",
    body: {
      name: "Deep Focus",
      description: "Sharper white",
      power: "on",
      hue: 40,
      saturation: 0,
      brightness: 0.6,
      kelvin: 6000
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.body;
  assert.equal(payload.scene.id, "deep-focus");
  assert.equal(controller.reconcileSceneUpdateCalls[0].previousSceneId, "focus");

  const savedScenes = JSON.parse(fs.readFileSync(process.env.SCENES_PATH, "utf8"));
  assert.equal(savedScenes[0].id, "deep-focus");
  assert.equal(savedScenes[0].name, "Deep Focus");
});

test("POST /api/reset restores writable state from shipped defaults and rescans discovery", async () => {
  process.env.SCENES_PATH = makeTempScenesPath();
  process.env.CONTROLLER_CONFIG_PATH = makeTempOptionsPath();
  process.env.KNOWN_DEVICES_PATH = makeTempKnownDevicesPath();

  fs.writeFileSync(
    process.env.SCENES_PATH,
    `${JSON.stringify([
      {
        id: "custom",
        name: "Custom",
        description: "Overridden",
        power: "on",
        hue: 12,
        saturation: 0.2,
        brightness: 0.3,
        kelvin: 3200
      }
    ], null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    process.env.CONTROLLER_CONFIG_PATH,
    `${JSON.stringify({
      transitionDurationMs: 300,
      defaultSceneKelvin: 6500
    }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    process.env.KNOWN_DEVICES_PATH,
    `${JSON.stringify({
      devices: [{ id: "a", enabled: false, color: true }]
    }, null, 2)}\n`,
    "utf8"
  );

  const defaultScenes = JSON.parse(
    fs.readFileSync(path.join(appRootDir, "defaults", "scenes.json"), "utf8")
  );
  const defaultOptions = JSON.parse(
    fs.readFileSync(path.join(appRootDir, "defaults", "options.json"), "utf8")
  );

  const { app, controller } = buildTestApp({
    scenes: defaultScenes,
    configOverrides: {
      knownDevices: [{ id: "a", enabled: false, color: true }],
      transitionDurationMs: 300,
      defaultSceneKelvin: 6500
    }
  });

  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/reset"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(controller.resetStateCalls[0].controllerConfig, defaultOptions);
  assert.deepEqual(controller.resetStateCalls[0].knownDevices, []);
  assert.equal(controller.resetDiscoveryCalls, 1);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(process.env.SCENES_PATH, "utf8")),
    defaultScenes
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(process.env.CONTROLLER_CONFIG_PATH, "utf8")),
    defaultOptions
  );
  assert.equal(fs.existsSync(process.env.KNOWN_DEVICES_PATH), false);
  assert.equal(response.body.status.scenes[0].id, defaultScenes[0].id);
});
