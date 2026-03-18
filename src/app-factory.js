import express from "express";
import path from "node:path";
import { appRootDir } from "./app-paths.js";
import { LifxController } from "./lifx-controller.js";
import { deriveSceneId, normalizeScene, validateScenes } from "./domain-utils.js";
import { saveScenesConfig } from "./scene-store.js";

const RESTART_EXIT_CODE = 75;

function getAppRoot(rootDir = appRootDir) {
  return path.resolve(rootDir);
}

export function createApp({
  controller,
  config,
  scenes,
  onRestart = () => {},
  rootDir = appRootDir
} = {}) {
  if (!controller) {
    throw new Error("createApp requires a controller instance.");
  }

  if (!config) {
    throw new Error("createApp requires a config object.");
  }

  let currentScenes = validateScenes(scenes, {
    defaultSceneKelvin: config.defaultSceneKelvin
  });
  const app = express();
  const appRoot = getAppRoot(rootDir);

  app.use(express.json());
  app.use("/assets/iconoir", express.static(path.join(appRoot, "node_modules", "iconoir", "icons")));
  app.use("/shared", express.static(path.join(appRoot, "shared")));
  app.use(express.static(path.join(appRoot, "public")));

  app.get("/api/status", async (_req, res, next) => {
    try {
      res.json(controller.getStatusPayload(currentScenes));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scenes/:sceneId", async (req, res, next) => {
    try {
      const scene = currentScenes.find((entry) => entry.id === req.params.sceneId);
      if (!scene) {
        res.status(404).json({ ok: false, error: "Scene not found." });
        return;
      }

      const lastAction = await controller.applyScene(scene);
      res.json({
        ok: true,
        scene,
        lastAction,
        status: controller.getStatusPayload(currentScenes)
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/scenes/:sceneId", async (req, res, next) => {
    try {
      const sceneIndex = currentScenes.findIndex((entry) => entry.id === req.params.sceneId);
      if (sceneIndex < 0) {
        res.status(404).json({ ok: false, error: "Scene not found." });
        return;
      }

      const existingScene = currentScenes[sceneIndex];
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

      const nextScenes = currentScenes.map((scene, index) => (index === sceneIndex ? nextScene : scene));
      const validatedScenes = validateScenes(nextScenes, {
        defaultSceneKelvin: config.defaultSceneKelvin
      });
      const savedScene = validatedScenes[sceneIndex];

      saveScenesConfig(validatedScenes);
      currentScenes = validatedScenes;
      controller.reconcileSceneUpdate(existingScene.id, savedScene);

      res.json({
        ok: true,
        previousSceneId: existingScene.id,
        scene: savedScene,
        status: controller.getStatusPayload(currentScenes)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scene-preview", async (req, res, next) => {
    try {
      const previewScene = normalizeScene(
        {
          power: req.body?.power,
          hue: req.body?.hue,
          saturation: req.body?.saturation,
          brightness: req.body?.brightness,
          kelvin: req.body?.kelvin
        },
        {
          defaultSceneKelvin: config.defaultSceneKelvin
        }
      );

      const result = await controller.previewScene(previewScene);
      res.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/discover", async (_req, res, next) => {
    try {
      await controller.refreshDiscovery();
      res.json(controller.getStatusPayload(currentScenes));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/targets", async (req, res, next) => {
    try {
      const devices = Array.isArray(req.body?.devices) ? req.body.devices : [];
      controller.setDeviceStates({ devices });
      res.json(controller.getStatusPayload(currentScenes));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/address-groups", async (req, res, next) => {
    try {
      controller.setAddressGroupEnabledState(String(req.body?.addressGroup ?? ""), Boolean(req.body?.enabled));
      res.json(controller.getStatusPayload(currentScenes));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/transition-duration", async (req, res, next) => {
    try {
      controller.setTransitionDurationMs(req.body?.transitionDurationMs);
      res.json(controller.getStatusPayload(currentScenes));
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
        status: controller.getStatusPayload(currentScenes)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/restart", async (_req, res, next) => {
    try {
      res.json({ ok: true, message: "Server restart requested." });
      setTimeout(() => {
        onRestart(RESTART_EXIT_CODE);
      }, 100);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ ok: false, error: message });
  });

  return {
    app,
    getScenes: () => currentScenes,
    setScenes: (nextScenes) => {
      currentScenes = validateScenes(nextScenes, {
        defaultSceneKelvin: config.defaultSceneKelvin
      });
      return currentScenes;
    }
  };
}

export async function startServer({ config, controller, rootDir = appRootDir } = {}) {
  const resolvedConfig = config ?? (await import("./config.js")).loadConfig();
  const resolvedController = controller ?? new LifxController(resolvedConfig);
  const validatedScenes = validateScenes(resolvedConfig.scenes, {
    defaultSceneKelvin: resolvedConfig.defaultSceneKelvin
  });

  let server;
  const shutdown = (exitCode = 0) => {
    resolvedController.stop();
    server.close(() => {
      process.exit(exitCode);
    });
  };

  const { app } = createApp({
    controller: resolvedController,
    config: resolvedConfig,
    scenes: validatedScenes,
    rootDir,
    onRestart: shutdown
  });

  server = app.listen(resolvedConfig.port, resolvedConfig.host, () => {
    console.log(`LIFX LAN controller listening on http://localhost:${resolvedConfig.port}`);
  });

  resolvedController.start().catch((error) => {
    console.error("Failed to initialize LIFX controller", error);
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("uncaughtException", (error) => {
    console.error(error);
    shutdown(1);
  });

  return { app, server, controller: resolvedController, shutdown };
}
