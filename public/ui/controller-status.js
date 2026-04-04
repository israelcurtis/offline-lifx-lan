import { getActionableLightCount } from "../lib/device-model.js";
import { formatBrightnessLabel, formatDurationLabel } from "../lib/light-model.js";
import { updateSliderProgress } from "../lib/dom-utils.js";

export function renderControllerStatus({
	warningText,
	targetedCount,
	onlineCount,
	discoveredCount,
	discoverButton,
	resetDefaultsButton,
	restartButton,
	activityText,
	transitionDurationSlider,
	transitionDurationValue,
	brightnessSlider,
	brightnessValue,
	serverMemory,
	state
}) {
	const payload = state.currentStatus;
	if (!payload) {
		targetedCount.textContent = "--";
		onlineCount.textContent = "--";
		discoveredCount.textContent = "--";
		return;
	}

	targetedCount.textContent = String(payload.targetedCount);
	onlineCount.textContent = String(payload.onlineCount);
	discoveredCount.textContent = String(payload.discoveredCount);
	serverMemory.textContent = payload.serverMemory
		? `${payload.serverMemory.rssMb} / ${payload.serverMemory.availableMb} / ${payload.serverMemory.limitMb} MB`
		: "--";
	serverMemory.title = payload.serverMemory
		? payload.serverMemory.memoryScope === "container"
			? `Node process resident RAM: ${payload.serverMemory.rssMb} MB. Container available RAM: ${payload.serverMemory.availableMb} MB. Container memory limit: ${payload.serverMemory.limitMb} MB. Container current usage: ${payload.serverMemory.usageMb} MB. Heap used: ${payload.serverMemory.heapUsedMb} MB. Warning threshold: ${payload.serverMemory.warningThresholdMb} MB.`
			: `Node process resident RAM: ${payload.serverMemory.rssMb} MB. System free RAM: ${payload.serverMemory.availableMb} MB. Total system RAM: ${payload.serverMemory.limitMb} MB. Heap used: ${payload.serverMemory.heapUsedMb} MB. Warning threshold: ${payload.serverMemory.warningThresholdMb} MB.`
		: "";
	serverMemory.dataset.pressure = payload.serverMemory ? payload.serverMemory.pressure : "normal";
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
