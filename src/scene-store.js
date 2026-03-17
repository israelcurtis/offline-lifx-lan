import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

const defaultScenePath = path.join(appRootDir, "config", "scenes.json");

export function getScenesFilePath() {
  return process.env.SCENES_PATH
    ? resolveFromAppRoot(process.env.SCENES_PATH)
    : defaultScenePath;
}

export function loadScenesConfig() {
  const raw = fs.readFileSync(getScenesFilePath(), "utf8");
  return JSON.parse(raw);
}

export function saveScenesConfig(scenes) {
  const filePath = getScenesFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(scenes, null, 2)}\n`, "utf8");
}
