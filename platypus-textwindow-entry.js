#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const bundledLauncherPath = path.join(process.cwd(), "src", "launcher.js");
await import(pathToFileURL(bundledLauncherPath).href);
