export const DEFAULT_SCENE_KELVIN = 5500;
export const MIN_SCENE_KELVIN = 1500;
export const MAX_SCENE_KELVIN = 9000;
export const SCENE_WHITE_SATURATION_THRESHOLD = 0.08;
export const LIGHT_WHITE_SATURATION_THRESHOLD_PERCENT = 8;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function deriveSceneId(name) {
  // Safari 12 parses this shared file for the browser UI, so avoid newer syntax here.
  const normalized = String(name == null ? "" : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error("Scene name must contain at least one letter or number.");
  }

  return normalized;
}

export function inferSceneMode(scene) {
  if (scene && scene.power === "off") {
    return "off";
  }

  return Number(scene && scene.saturation != null ? scene.saturation : 0) <= SCENE_WHITE_SATURATION_THRESHOLD
    ? "white"
    : "color";
}

export function normalizeBrightnessPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

export function normalizeSceneKelvin(kelvin, fallback = DEFAULT_SCENE_KELVIN) {
  return clamp(Number(kelvin == null ? fallback : kelvin), MIN_SCENE_KELVIN, MAX_SCENE_KELVIN);
}
