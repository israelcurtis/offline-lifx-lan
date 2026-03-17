import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadScenesConfig, saveScenesConfig } from "../src/scene-store.js";

const tempPaths = new Set();
const originalScenesPath = process.env.SCENES_PATH;

afterEach(() => {
  if (originalScenesPath === undefined) {
    delete process.env.SCENES_PATH;
  } else {
    process.env.SCENES_PATH = originalScenesPath;
  }

  for (const targetPath of tempPaths) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  tempPaths.clear();
});

function makeTempScenesPath() {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "offline-lifx-lan-scenes-test-"));
  tempPaths.add(tempDir);
  return path.join(tempDir, "scenes.json");
}

test("saveScenesConfig writes scenes and loadScenesConfig reads them back", () => {
  process.env.SCENES_PATH = makeTempScenesPath();

  const scenes = [
    {
      id: "test-scene",
      name: "Test Scene",
      description: "Test",
      power: "on",
      hue: 180,
      saturation: 0.5,
      brightness: 0.6,
      kelvin: 3500
    }
  ];

  saveScenesConfig(scenes);

  assert.deepEqual(loadScenesConfig(), scenes);
});
