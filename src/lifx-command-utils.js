export function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export function describeLight(light) {
  return `${light.label ?? "Bulb"} (${light.id} @ ${light.address})`;
}

export function invokeCommand(command) {
  return new Promise((resolve, reject) => {
    command((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function requestLightState(light) {
  return new Promise((resolve, reject) => {
    light.getState((error, state) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(state);
    });
  });
}

export function requestLightHardwareVersion(light) {
  return new Promise((resolve, reject) => {
    light.getHardwareVersion((error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });
}

export function normalizeLightState(state) {
  if (!state || typeof state !== "object") {
    return null;
  }

  return {
    power: state.power === 1 ? "on" : "off",
    hue: Number(state.color?.hue ?? 0),
    saturation: Number(state.color?.saturation ?? 0),
    brightness: Number(state.color?.brightness ?? 0),
    kelvin: Number(state.color?.kelvin ?? 3500),
    updatedAt: new Date().toISOString()
  };
}
