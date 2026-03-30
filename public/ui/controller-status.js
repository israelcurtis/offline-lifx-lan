import { getActionableLightCount } from "../lib/device-model.js";
import { formatBrightnessLabel, formatDurationLabel } from "../lib/light-model.js";
import { updateSliderProgress } from "../lib/dom-utils.js";

export function renderControllerStatus({
	statusText,
	warningText,
	targetedCount,
	discoverButton,
	resetDefaultsButton,
	restartButton,
	activityText,
	transitionDurationSlider,
	transitionDurationValue,
	brightnessSlider,
	brightnessValue,
	state
}) {
	const payload = state.currentStatus;
	if (!payload) {
		statusText.textContent = "Loading...";
		return;
	}

	const statusParts = [];
	statusParts.push(`${payload.onlineCount} of ${payload.discoveredCount} discovered bulbs online.`);
	if (payload.lastAction) {
		statusParts.push(
			`Last scene: ${payload.lastAction.sceneName} at ${new Date(payload.lastAction.appliedAt).toLocaleTimeString()}.`
		);
	}
	statusText.textContent = statusParts.join(" ");
	targetedCount.textContent = `${payload.targetedCount} / ${payload.discoveredCount}`;
	warningText.hidden = !payload.warning;
	warningText.textContent = payload.warning || "";

	const brightnessAvailable = getActionableLightCount(payload.lights) > 0;
	brightnessSlider.disabled = state.isSubmitting || !brightnessAvailable;
	transitionDurationSlider.disabled = state.isSubmitting;

	if (!state.isAdjustingTransitionDuration) {
		transitionDurationSlider.value = String(payload.transitionDurationMs);
		transitionDurationValue.textContent = formatDurationLabel(payload.transitionDurationMs);
		updateSliderProgress(transitionDurationSlider, transitionDurationSlider.value);
	}

	if (!state.isAdjustingLiveBrightness) {
		const liveBrightnessPercent = payload.liveBrightnessPercent == null ? 0 : payload.liveBrightnessPercent;
		brightnessSlider.value = String(liveBrightnessPercent);
		brightnessValue.textContent = formatBrightnessLabel(payload.liveBrightnessPercent);
		updateSliderProgress(brightnessSlider, brightnessSlider.value);
	}

	activityText.hidden = !state.activeActivityMessage;
	activityText.textContent = state.activeActivityMessage;
	discoverButton.dataset.busy = String(state.isSubmitting && state.activeActivityKind === "discover");
	resetDefaultsButton.dataset.busy = String(state.isSubmitting && state.activeActivityKind === "reset");
	restartButton.dataset.busy = String(state.isSubmitting && state.activeActivityKind === "restart");
	resetDefaultsButton.dataset.confirming = String(state.isConfirmingReset);
	resetDefaultsButton.disabled = state.isSubmitting;
	discoverButton.textContent = state.isSubmitting && state.activeActivityKind === "discover" ? "Rescanning..." : "Rescan LAN";
	resetDefaultsButton.textContent = state.isSubmitting && state.activeActivityKind === "reset"
		? "Resetting..."
		: state.isConfirmingReset
			? "Click Again to Reset"
			: "Reset to Defaults";
	restartButton.textContent = state.isSubmitting && state.activeActivityKind === "restart" ? "Restarting..." : "Restart Server";
}
