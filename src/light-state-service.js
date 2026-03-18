import { normalizeLightState, requestLightState } from "./lifx-command-utils.js";

export const STATE_REFRESH_INTERVAL_MS = 3000;

export class LightStateService {
  constructor({
    getLights,
    isStarted,
    isSceneApplyInFlight,
    onRefreshError = () => {}
  }) {
    this.getLights = getLights;
    this.isStarted = isStarted;
    this.isSceneApplyInFlight = isSceneApplyInFlight;
    this.onRefreshError = onRefreshError;
    this.cache = new Map();
    this.stateRefreshTimer = null;
    this.stateRefreshResumeTimer = null;
    this.stateRefreshInFlight = false;
    this.stateRefreshBlockedUntil = 0;
  }

  get(lightId) {
    return this.cache.get(lightId) ?? null;
  }

  set(lightId, state) {
    this.cache.set(lightId, state);
  }

  clear() {
    this.cache.clear();
  }

  markOffline(lightId) {
    const cachedState = this.cache.get(lightId);
    if (!cachedState) {
      return;
    }

    this.cache.set(lightId, {
      ...cachedState,
      power: "off",
      brightness: 0,
      updatedAt: new Date().toISOString()
    });
  }

  startRefreshLoop() {
    this.stopRefreshLoop();
    this.stateRefreshTimer = setInterval(() => {
      this.queueRefresh();
    }, STATE_REFRESH_INTERVAL_MS);
  }

  stopRefreshLoop() {
    if (this.stateRefreshTimer) {
      clearInterval(this.stateRefreshTimer);
      this.stateRefreshTimer = null;
    }
  }

  stop() {
    this.stopRefreshLoop();
    if (this.stateRefreshResumeTimer) {
      clearTimeout(this.stateRefreshResumeTimer);
      this.stateRefreshResumeTimer = null;
    }
    this.stateRefreshBlockedUntil = 0;
    this.stateRefreshInFlight = false;
    this.clear();
  }

  queueRefresh(force = false) {
    void this.refreshLightStates(force).catch((error) => {
      this.onRefreshError(error);
    });
  }

  holdRefreshes(durationMs) {
    this.stateRefreshBlockedUntil = Date.now() + durationMs;
    if (this.stateRefreshResumeTimer) {
      clearTimeout(this.stateRefreshResumeTimer);
    }
    this.stateRefreshResumeTimer = setTimeout(() => {
      this.stateRefreshResumeTimer = null;
      this.queueRefresh(true);
    }, durationMs);
  }

  async refreshLightStates(force = false) {
    if (!this.isStarted() || this.stateRefreshInFlight) {
      return;
    }

    if (!force && this.isSceneApplyInFlight()) {
      return;
    }

    if (!force && Date.now() < this.stateRefreshBlockedUntil) {
      return;
    }

    this.stateRefreshInFlight = true;

    try {
      const onlineLights = this.getLights().filter((light) => light.status === "on");
      const results = await Promise.allSettled(
        onlineLights.map(async (light) => {
          const state = await requestLightState(light);
          this.cache.set(light.id, normalizeLightState(state));
        })
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const light = onlineLights[index];
          const cachedState = this.cache.get(light.id);
          if (cachedState) {
            this.cache.set(light.id, {
              ...cachedState,
              updatedAt: new Date().toISOString()
            });
          }
        }
      });
    } finally {
      this.stateRefreshInFlight = false;
    }
  }
}
