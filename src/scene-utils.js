export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export const DEFAULT_SCENE_KELVIN = 5500;

export function deriveSceneId(name) {
  const normalized = String(name ?? "")
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

export function normalizeScene(scene, { defaultSceneKelvin = DEFAULT_SCENE_KELVIN } = {}) {
  return {
    ...scene,
    power: scene.power === "off" ? "off" : "on",
    hue: clamp(Number(scene.hue ?? 0), 0, 360),
    saturation: clamp(Number(scene.saturation ?? 0), 0, 1),
    brightness: clamp(Number(scene.brightness ?? 0), 0, 1),
    kelvin: clamp(Number(scene.kelvin ?? defaultSceneKelvin), 1500, 9000)
  };
}

export function validateScenes(scenes, options = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("Scene configuration must be a non-empty array.");
  }

  const ids = new Set();
  return scenes.map((scene, index) => {
    if (!scene?.id || !scene?.name) {
      throw new Error(`Scene at index ${index} must include id and name.`);
    }

    if (ids.has(scene.id)) {
      throw new Error(`Duplicate scene id: ${scene.id}`);
    }

    ids.add(scene.id);
    return normalizeScene(scene, options);
  });
}

export function pickTargetLights(
  lights,
  { targetLabels = [], targetIds = [], targetAddresses = [] } = {}
) {
  if (targetIds.length) {
    const idSet = new Set(targetIds.map((value) => value.toLowerCase()));
    return lights.filter((light) => idSet.has(String(light.id ?? "").toLowerCase()));
  }

  if (targetLabels.length) {
    const labelSet = new Set(targetLabels.map((label) => label.toLowerCase()));
    return lights.filter((light) => labelSet.has(String(light.label ?? "").toLowerCase()));
  }

  if (targetAddresses.length) {
    const addressSet = new Set(targetAddresses.map((value) => value.toLowerCase()));
    return lights.filter((light) => addressSet.has(String(light.address ?? "").toLowerCase()));
  }

  if (!targetLabels.length) {
    return lights;
  }

  return lights;
}
