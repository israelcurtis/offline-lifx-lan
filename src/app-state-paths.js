import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { appRootDir, resolveFromAppRoot } from "./app-paths.js";

const defaultConfigDir = path.join(appRootDir, "defaults");
const defaultStateDir = path.join(appRootDir, "state");

export function getDefaultsDir() {
  return defaultConfigDir;
}

export function getStateDir() {
  return process.env.APP_STATE_DIR
    ? resolveFromAppRoot(process.env.APP_STATE_DIR)
    : defaultStateDir;
}

export function getDefaultConfigFilePath(fileName) {
  return path.join(getDefaultsDir(), fileName);
}

export function getStateFilePath(fileName, envVarName) {
  return process.env[envVarName]
    ? resolveFromAppRoot(process.env[envVarName])
    : path.join(getStateDir(), fileName);
}

export function bootstrapStateFile({ filePath, defaultFilePath }) {
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.copyFileSync(defaultFilePath, filePath);
  return filePath;
}
