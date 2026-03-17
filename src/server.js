import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { LifxController } from "./lifx-controller.js";
import { deriveSceneId, validateScenes } from "./scene-utils.js";
import { saveScenesConfig } from "./scene-store.js";

const RESTART_EXIT_CODE = 75;
const config = loadConfig();
let scenes = validateScenes(config.scenes, { defaultSceneKelvin: config.defaultSceneKelvin });
const app = express();
const controller = new LifxController(config);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(express.json());
app.use("/assets/iconoir", express.static(path.join(rootDir, "node_modules", "iconoir", "icons")));
app.use(express.static(path.join(rootDir, "public")));

app.get("/api/status", async (_req, res, next) => {
  try {
    res.json(controller.getStatusPayload(scenes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/scenes/:sceneId", async (req, res, next) => {
  try {
    const scene = scenes.find((entry) => entry.id === req.params.sceneId);
    if (!scene) {
      res.status(404).json({ ok: false, error: "Scene not found." });
      return;
    }

    const lastAction = await controller.applyScene(scene);
    res.json({
      ok: true,
      scene,
      lastAction,
      status: controller.getStatusPayload(scenes)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/scenes/:sceneId", async (req, res, next) => {
  try {
    const sceneIndex = scenes.findIndex((entry) => entry.id === req.params.sceneId);
    if (sceneIndex < 0) {
      res.status(404).json({ ok: false, error: "Scene not found." });
      return;
    }

    const existingScene = scenes[sceneIndex];
    const nextScene = {
      ...existingScene,
      id: deriveSceneId(req.body?.name),
      name: String(req.body?.name ?? "").trim(),
      description: String(req.body?.description ?? "").trim(),
      power: req.body?.power ?? existingScene.power,
      hue: req.body?.hue ?? existingScene.hue,
      saturation: req.body?.saturation ?? existingScene.saturation,
      brightness: req.body?.brightness ?? existingScene.brightness,
      kelvin: req.body?.kelvin ?? existingScene.kelvin
    };

    const nextScenes = scenes.map((scene, index) => (index === sceneIndex ? nextScene : scene));
    const validatedScenes = validateScenes(nextScenes, { defaultSceneKelvin: config.defaultSceneKelvin });
    const savedScene = validatedScenes[sceneIndex];

    saveScenesConfig(validatedScenes);
    scenes = validatedScenes;
    controller.reconcileSceneUpdate(existingScene.id, savedScene);
    let lastAction = null;
    let applyError = null;

    try {
      lastAction = await controller.applyScene(savedScene);
    } catch (error) {
      applyError = error instanceof Error ? error.message : String(error);
    }

    res.json({
      ok: true,
      previousSceneId: existingScene.id,
      scene: savedScene,
      lastAction,
      applyError,
      status: controller.getStatusPayload(scenes)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/discover", async (_req, res, next) => {
  try {
    await controller.refreshDiscovery();
    res.json(controller.getStatusPayload(scenes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/targets", async (req, res, next) => {
  try {
    const enabledTargetIds = Array.isArray(req.body?.enabledTargetIds) ? req.body.enabledTargetIds : [];
    const disabledTargetIds = Array.isArray(req.body?.disabledTargetIds) ? req.body.disabledTargetIds : [];
    controller.setDeviceStates({ enabledTargetIds, disabledTargetIds });
    res.json(controller.getStatusPayload(scenes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/address-groups", async (req, res, next) => {
  try {
    controller.setAddressGroupEnabledState(String(req.body?.addressGroup ?? ""), Boolean(req.body?.enabled));
    res.json(controller.getStatusPayload(scenes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/transition-duration", async (req, res, next) => {
  try {
    controller.setTransitionDurationMs(req.body?.transitionDurationMs);
    res.json(controller.getStatusPayload(scenes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/brightness", async (req, res, next) => {
  try {
    const result = await controller.setLiveBrightnessPercent(req.body?.brightnessPercent);
    res.json({
      ok: true,
      result,
      status: controller.getStatusPayload(scenes)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/restart", async (_req, res, next) => {
  try {
    res.json({ ok: true, message: "Server restart requested." });
    setTimeout(() => {
      shutdown(RESTART_EXIT_CODE);
    }, 100);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(500).json({ ok: false, error: message });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`LIFX LAN controller listening on http://localhost:${config.port}`);
});

controller.start().catch((error) => {
  console.error("Failed to initialize LIFX controller", error);
});

const shutdown = (exitCode = 0) => {
  controller.stop();
  server.close(() => {
    process.exit(exitCode);
  });
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown(1);
});
