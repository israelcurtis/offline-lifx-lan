import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_SCENE_KELVIN,
  DEFAULT_TRANSITION_DURATION_MS,
  loadControllerConfig,
  saveControllerConfig
} from "../src/controller-config-store.js";

const tempPaths = new Set();
const originalControllerConfigPath = process.env.CONTROLLER_CONFIG_PATH;

afterEach(() => {
  if (originalControllerConfigPath === undefined) {
    delete process.env.CONTROLLER_CONFIG_PATH;
  } else {
    process.env.CONTROLLER_CONFIG_PATH = originalControllerConfigPath;
  }

  for (const targetPath of tempPaths) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  tempPaths.clear();
});

function makeTempOptionsPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-options-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "options.json");
}

test("loadControllerConfig returns both tracked defaults when the file does not exist", () => {
  process.env.CONTROLLER_CONFIG_PATH = makeTempOptionsPath();

  assert.deepEqual(loadControllerConfig(), {
    transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS,
    defaultSceneKelvin: DEFAULT_SCENE_KELVIN
  });
});

test("saveControllerConfig persists transition duration and default scene kelvin", () => {
  process.env.CONTROLLER_CONFIG_PATH = makeTempOptionsPath();

  const savedConfig = saveControllerConfig({
    transitionDurationMs: 600,
    defaultSceneKelvin: 6100
  });

  assert.deepEqual(savedConfig, {
    transitionDurationMs: 600,
    defaultSceneKelvin: 6100
  });
  assert.deepEqual(loadControllerConfig(), savedConfig);
});

test("loadControllerConfig falls back to tracked defaults when the JSON is invalid", () => {
  process.env.CONTROLLER_CONFIG_PATH = makeTempOptionsPath();
  fs.writeFileSync(process.env.CONTROLLER_CONFIG_PATH, "{invalid json\n", "utf8");

  assert.deepEqual(loadControllerConfig(), {
    transitionDurationMs: DEFAULT_TRANSITION_DURATION_MS,
    defaultSceneKelvin: DEFAULT_SCENE_KELVIN
  });
});
