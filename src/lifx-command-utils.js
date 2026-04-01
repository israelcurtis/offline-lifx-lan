const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

export function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export function describeLight(light) {
  return `${light.label ?? "Bulb"} (${light.id} @ ${light.address})`;
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function invokeCommand(command, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
  const promise = new Promise((resolve, reject) => {
    command((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return withTimeout(promise, timeoutMs, "LIFX command");
}

export function requestLightState(light, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
  const promise = new Promise((resolve, reject) => {
    light.getState((error, state) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(state);
    });
  });

  return withTimeout(promise, timeoutMs, "getState");
}

export function requestLightHardwareVersion(light, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
  const promise = new Promise((resolve, reject) => {
    light.getHardwareVersion((error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });

  return withTimeout(promise, timeoutMs, "getHardwareVersion");
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
