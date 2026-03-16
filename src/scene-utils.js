export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeScene(scene) {
  return {
    ...scene,
    power: scene.power === "off" ? "off" : "on",
    hue: clamp(Number(scene.hue ?? 0), 0, 360),
    saturation: clamp(Number(scene.saturation ?? 0), 0, 1),
    brightness: clamp(Number(scene.brightness ?? 0), 0, 1),
    kelvin: clamp(Number(scene.kelvin ?? 3500), 1500, 9000)
  };
}

export function validateScenes(scenes) {
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
    return normalizeScene(scene);
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
