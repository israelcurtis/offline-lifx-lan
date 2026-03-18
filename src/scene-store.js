import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

const defaultScenePath = path.join(appRootDir, "config", "scenes.json");

export function getScenesFilePath() {
  return process.env.SCENES_PATH
    ? resolveFromAppRoot(process.env.SCENES_PATH)
    : defaultScenePath;
}

export function loadScenesConfig() {
  const filePath = getScenesFilePath();
  const scenes = loadJsonFile(filePath, {
    onMissing: () => {
      throw new Error(`Scene configuration file not found at ${filePath}.`);
    },
    onInvalid: (error) => {
      throw new Error(`Invalid scene configuration in ${filePath}: ${error.message}`);
    }
  });

  if (!Array.isArray(scenes)) {
    throw new Error(`Scene configuration in ${filePath} must be a JSON array.`);
  }

  return scenes;
}

export function saveScenesConfig(scenes) {
  const filePath = getScenesFilePath();
  saveJsonFile(filePath, scenes);
}
