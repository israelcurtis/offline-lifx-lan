#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const bundledLauncherPath = path.join(appRootDir, "src", "launcher.js");
await import(pathToFileURL(bundledLauncherPath).href);
