import path from "node:path";
import { fileURLToPath } from "node:url";

export const appRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolveFromAppRoot(targetPath) {
  if (!targetPath) {
    return appRootDir;
  }

  return path.isAbsolute(targetPath) ? targetPath : path.resolve(appRootDir, targetPath);
}
