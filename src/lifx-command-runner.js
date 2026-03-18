import { describeLight, invokeCommand, normalizeLightState, requestLightState } from "./lifx-command-utils.js";
import { normalizeBrightnessPercent } from "./domain-utils.js";

const STATE_REFRESH_BUFFER_MS = 250;
const LIVE_BRIGHTNESS_TRANSITION_MS = 100;
const LIVE_SCENE_PREVIEW_TRANSITION_MS = 100;

function toPercent(value) {
  return Math.round(value * 100);
}

export class LifxCommandRunner {
  constructor({
    getTargetLights,
    getDefaultSceneKelvin,
    getTransitionDurationMs,
    stateService,
    onSceneApplied = () => {},
    onBrightnessUpdated = () => {}
  }) {
    this.getTargetLights = getTargetLights;
    this.getDefaultSceneKelvin = getDefaultSceneKelvin;
    this.getTransitionDurationMs = getTransitionDurationMs;
    this.stateService = stateService;
    this.onSceneApplied = onSceneApplied;
    this.onBrightnessUpdated = onBrightnessUpdated;
    this.sceneApplyInFlight = false;
  }

  isSceneApplyInFlight() {
    return this.sceneApplyInFlight;
  }

  async applyScene(scene) {
    return this.runSceneCommand(scene, {
      durationMs: this.getTransitionDurationMs(),
      updateLastAction: true
    });
  }

  async previewScene(scene) {
    return this.runSceneCommand(scene, {
      durationMs: LIVE_SCENE_PREVIEW_TRANSITION_MS,
      updateLastAction: false
    });
  }

  async runSceneCommand(scene, { durationMs, updateLastAction = true } = {}) {
    const targetLights = this.getTargetLights();
    if (targetLights.length === 0) {
      throw new Error("No target bulbs are currently online.");
    }

    const failures = [];
    this.sceneApplyInFlight = true;

    try {
      const results = await Promise.allSettled(
        targetLights.map(async (light) => {
          const cachedState = this.stateService.get(light.id);
          const resolvedState = cachedState
            ?? normalizeLightState(await requestLightState(light))
            ?? {
              power: "off",
              hue: 0,
              saturation: 0,
              brightness: 0,
              kelvin: this.getDefaultSceneKelvin(),
              updatedAt: new Date().toISOString()
            };

          if (scene.power === "off") {
            await invokeCommand((callback) => {
              light.off(durationMs, callback);
            });

            this.stateService.set(light.id, {
              ...resolvedState,
              power: "off",
              brightness: 0,
              updatedAt: new Date().toISOString()
            });
            return;
          }

          const targetBrightness = Math.max(1, toPercent(scene.brightness));
          if (resolvedState.power === "on") {
            await invokeCommand((callback) => {
              light.color(
                scene.hue,
                toPercent(scene.saturation),
                targetBrightness,
                scene.kelvin,
                durationMs,
                callback
              );
            });
          } else {
            await invokeCommand((callback) => {
              light.color(
                scene.hue,
                toPercent(scene.saturation),
                1,
                scene.kelvin,
                0,
                callback
              );
            });

            await invokeCommand((callback) => {
              light.on(0, callback);
            });

            await invokeCommand((callback) => {
              light.color(
                scene.hue,
                toPercent(scene.saturation),
                targetBrightness,
                scene.kelvin,
                durationMs,
                callback
              );
            });
          }

          this.stateService.set(light.id, {
            ...resolvedState,
            power: "on",
            hue: Number(scene.hue ?? resolvedState.hue),
            saturation: toPercent(scene.saturation),
            brightness: targetBrightness,
            kelvin: Number(scene.kelvin ?? resolvedState.kelvin),
            updatedAt: new Date().toISOString()
          });
        })
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failures.push({
            id: targetLights[index].id,
            label: targetLights[index].label ?? null,
            address: targetLights[index].address,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      });
    } finally {
      this.sceneApplyInFlight = false;
    }

    const result = {
      targetedCount: targetLights.length,
      successCount: targetLights.length - failures.length,
      failures
    };

    if (!updateLastAction) {
      if (failures.length > 0) {
        console.warn(
          `Live scene preview completed with ${failures.length} failure(s): ${failures
            .map((failure) => describeLight(failure))
            .join(", ")}`
        );
      }

      this.stateService.holdRefreshes(durationMs + STATE_REFRESH_BUFFER_MS);
      return result;
    }

    const lastAction = {
      sceneId: scene.id,
      sceneName: scene.name,
      appliedAt: new Date().toISOString(),
      ...result
    };

    if (failures.length > 0) {
      console.warn(
        `Scene ${scene.id} completed with ${failures.length} failure(s): ${failures
          .map((failure) => describeLight(failure))
          .join(", ")}`
      );
    } else {
      console.log(`Scene ${scene.id} applied to ${targetLights.length} bulb(s).`);
    }

    this.onSceneApplied(lastAction);
    this.stateService.holdRefreshes(durationMs + STATE_REFRESH_BUFFER_MS);
    return lastAction;
  }

  async setLiveBrightnessPercent(brightnessPercent) {
    const targetLights = this.getTargetLights();
    if (targetLights.length === 0) {
      throw new Error("No target bulbs are currently online.");
    }

    const normalizedBrightness = normalizeBrightnessPercent(brightnessPercent);
    const failures = [];

    const results = await Promise.allSettled(
      targetLights.map(async (light) => {
        const cachedState = this.stateService.get(light.id);
        const state = cachedState?.power === "on"
          ? cachedState
          : normalizeLightState(await requestLightState(light)) ?? cachedState ?? {
            power: "off",
            hue: 0,
            saturation: 0,
            brightness: 0,
            kelvin: 3500,
            updatedAt: new Date().toISOString()
          };

        if (normalizedBrightness === 0) {
          if (state.power === "on") {
            await invokeCommand((callback) => {
              light.off(LIVE_BRIGHTNESS_TRANSITION_MS, callback);
            });
          }

          this.stateService.set(light.id, {
            ...state,
            power: "off",
            brightness: 0,
            updatedAt: new Date().toISOString()
          });
          return;
        }

        const nextBrightness = Math.max(1, normalizedBrightness);

        if (state.power !== "on") {
          await invokeCommand((callback) => {
            light.color(
              state.hue,
              state.saturation,
              1,
              state.kelvin,
              0,
              callback
            );
          });

          await invokeCommand((callback) => {
            light.on(0, callback);
          });
        }

        await invokeCommand((callback) => {
          light.color(
            state.hue,
            state.saturation,
            nextBrightness,
            state.kelvin,
            LIVE_BRIGHTNESS_TRANSITION_MS,
            callback
          );
        });

        this.stateService.set(light.id, {
          ...state,
          power: "on",
          brightness: nextBrightness,
          updatedAt: new Date().toISOString()
        });
      })
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failures.push({
          id: targetLights[index].id,
          label: targetLights[index].label ?? null,
          address: targetLights[index].address,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    });

    if (failures.length > 0) {
      console.warn(
        `Live brightness update completed with ${failures.length} failure(s): ${failures
          .map((failure) => describeLight(failure))
          .join(", ")}`
      );
    }

    this.stateService.holdRefreshes(350);

    const payload = {
      brightnessPercent: normalizedBrightness,
      targetedCount: targetLights.length,
      successCount: targetLights.length - failures.length,
      failures
    };

    this.onBrightnessUpdated(payload);
    return payload;
  }
}
