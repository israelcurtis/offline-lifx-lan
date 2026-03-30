import { bootstrapStateFile, getDefaultConfigFilePath, getStateFilePath } from "./app-state-paths.js";
import { loadJsonFile, saveJsonFile } from "./json-store.js";

const defaultScenePath = getDefaultConfigFilePath("scenes.json");

export function getScenesFilePath() {
  return getStateFilePath("scenes.json", "SCENES_PATH");
}

export function loadScenesConfig() {
  const filePath = getScenesFilePath();
  bootstrapStateFile({
    filePath,
    defaultFilePath: defaultScenePath
  });
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
  bootstrapStateFile({
    filePath,
    defaultFilePath: defaultScenePath
  });
  saveJsonFile(filePath, scenes);
}
