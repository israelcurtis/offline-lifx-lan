import fs from "node:fs";
import path from "node:path";

export function loadJsonFile(filePath, { onMissing, onInvalid } = {}) {
  if (!fs.existsSync(filePath)) {
    return typeof onMissing === "function" ? onMissing() : undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (typeof onInvalid === "function") {
      return onInvalid(error);
    }

    const wrappedError = new Error(`Failed to read JSON file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    wrappedError.cause = error;
    throw wrappedError;
  }
}

export function saveJsonFile(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
  return payload;
}
