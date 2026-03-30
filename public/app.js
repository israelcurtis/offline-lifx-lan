import {
	applyScene,
	discoverLan,
	loadStatus,
	resetToDefaults,
	restartServer,
	saveAddressGroupState,
	saveLiveBrightness,
	saveScenePreview,
	saveTargets,
	saveTransitionDuration,
	updateScene,
	waitForServerReady
} from "./api.js";
import { applyOptimisticKnownDeviceState } from "./lib/device-model.js";
import {
	buildEditingSceneValues,
	formatBrightnessLabel,
	formatDurationLabel,
	getDefaultSceneKelvin,
	makeSceneDraft
} from "./lib/light-model.js";
import { mediaQueryMatches, updateSliderProgress } from "./lib/dom-utils.js";
import { createLiveCommandQueue } from "./lib/live-command-queue.js";
import { createAppStore } from "./state/app-store.js";
import { renderControllerStatus } from "./ui/controller-status.js";
import { renderDeviceGrid } from "./ui/device-grid.js";
import { renderSceneEditor } from "./ui/scene-editor.js";
import { renderSceneGrid } from "./ui/scene-grid.js";

const LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS = 100;
const LIVE_BRIGHTNESS_REFRESH_DELAY_MS = 300;
const LIVE_SCENE_PREVIEW_DISPATCH_INTERVAL_MS = 100;
const LIVE_SCENE_PREVIEW_REFRESH_DELAY_MS = 400;
const STATUS_POLL_INTERVAL_MS = 3000;
const RESET_CONFIRMATION_TIMEOUT_MS = 5000;

const elements = {
	statusText: document.querySelector("#status-text"),
	warningText: document.querySelector("#warning-text"),
	targetedCount: document.querySelector("#targeted-count"),
	sceneGrid: document.querySelector("#scene-grid"),
	sceneEditorSection: document.querySelector("#scene-editor-section"),
	sceneEditorContainer: document.querySelector("#scene-editor-container"),
	lightGrid: document.querySelector("#light-grid"),
	discoverButton: document.querySelector("#discover-button"),
	resetDefaultsButton: document.querySelector("#reset-defaults-button"),
	restartButton: document.querySelector("#restart-button"),
	activityText: document.querySelector("#activity-text"),
	transitionDurationSlider: document.querySelector("#transition-duration-slider"),
	transitionDurationValue: document.querySelector("#transition-duration-value"),
	brightnessSlider: document.querySelector("#brightness-slider"),
	brightnessValue: document.querySelector("#brightness-value")
};

const store = createAppStore();
const state = store.getState();
let resetConfirmationTimer = null;

function clearResetConfirmation() {
	if (resetConfirmationTimer) {
		clearTimeout(resetConfirmationTimer);
		resetConfirmationTimer = null;
	}
	store.setResetConfirmation(false);
}

function armResetConfirmation() {
	clearResetConfirmation();
	store.setResetConfirmation(true);
	store.setActivity("Click \"Reset to Defaults\" again within 5 seconds to purge live state and rescan the LAN.", {
		kind: "reset"
	});
	resetConfirmationTimer = setTimeout(() => {
		resetConfirmationTimer = null;
		store.setResetConfirmation(false);
		store.setActivity("");
	}, RESET_CONFIRMATION_TIMEOUT_MS);
}

function showError(error) {
	elements.statusText.textContent = error instanceof Error ? error.message : String(error);
}

function renderApp() {
	renderControllerStatus({
		...elements,
		state
	});
	renderSceneGrid({
		sceneGrid: elements.sceneGrid,
		state,
		actions
	});
	renderSceneEditor({
		sceneEditorSection: elements.sceneEditorSection,
		sceneEditorContainer: elements.sceneEditorContainer,
		state,
		queues: {
			scenePreviewQueue
		},
		actions
	});
	renderDeviceGrid({
		lightGrid: elements.lightGrid,
		state,
		actions
	});
}

async function refreshStatus() {
	const payload = await loadStatus();
	store.setStatus(payload);
	return payload;
}

function updateTransitionSliderDisplay(durationMs) {
	const nextValue = String(Math.round(durationMs));
	elements.transitionDurationSlider.value = nextValue;
	elements.transitionDurationValue.textContent = formatDurationLabel(durationMs);
	updateSliderProgress(elements.transitionDurationSlider, nextValue);
}

function updateBrightnessSliderDisplay(brightnessPercent) {
	const nextValue = String(Math.round(brightnessPercent == null ? 0 : brightnessPercent));
	elements.brightnessSlider.value = nextValue;
	elements.brightnessValue.textContent = formatBrightnessLabel(brightnessPercent);
	updateSliderProgress(elements.brightnessSlider, nextValue);
}

function closeSceneEditor({ scheduleRefresh = true } = {}) {
	const shouldRefresh = state.hasLiveScenePreview || scenePreviewQueue.isRequestInFlight();
	scenePreviewQueue.clearPending();
	store.clearEditingScene();
	store.setLiveScenePreview(false);
	if (scheduleRefresh && shouldRefresh) {
		scenePreviewQueue.scheduleRefresh();
	}
}

function openSceneEditor(scene) {
	store.setEditingScene(scene.id, makeSceneDraft(scene, getDefaultSceneKelvin(state.currentStatus)));
	scenePreviewQueue.clearPending();
	store.setLiveScenePreview(false);

	// Keep media-query checks compatible with older Safari while preserving current behavior.
	if (mediaQueryMatches("(max-width: 640px)")) {
		requestAnimationFrame(() => {
			elements.sceneEditorSection.scrollIntoView({
				behavior: mediaQueryMatches("(prefers-reduced-motion: reduce)") ? "auto" : "smooth",
				block: "start"
			});
		});
	}
}

async function handleApplyScene(sceneId) {
	try {
		store.setSubmitting(true);
		const payload = await applyScene(sceneId);
		store.setSceneFeedback(sceneId, "Applied");
		store.setStatus(payload.status);
	} catch (error) {
		showError(error);
	} finally {
		store.setSubmitting(false);
	}
}

async function handleSaveEditingScene() {
	const currentScenes = state.currentStatus && state.currentStatus.scenes ? state.currentStatus.scenes : [];
	const scene = currentScenes.find((entry) => entry.id === state.editingSceneId);
	if (!scene || !state.editingSceneDraft) {
		return;
	}

	try {
		store.setSubmitting(true);
		await scenePreviewQueue.flushNow();
		const payload = await updateScene(scene.id, {
			name: state.editingSceneDraft.name,
			description: state.editingSceneDraft.description,
			...buildEditingSceneValues(state.editingSceneDraft, getDefaultSceneKelvin(state.currentStatus))
		});

		if (
			state.currentStatus
			&& state.currentStatus.lastAction
			&& state.currentStatus.lastAction.sceneId === payload.previousSceneId
			|| state.hasLiveScenePreview
		) {
			payload.status.lastAction = {
				...(payload.status.lastAction || {}),
				sceneId: payload.scene.id,
				sceneName: payload.scene.name,
				appliedAt: new Date().toISOString()
			};
		}

		store.setSceneFeedback(payload.scene.id, "Updated");
		closeSceneEditor({ scheduleRefresh: false });
		store.setStatus(payload.status);
	} catch (error) {
		showError(error);
	} finally {
		store.setSubmitting(false);
	}
}

async function handleToggleTarget(lightId) {
	if (!state.currentStatus || !state.currentStatus.manualTargetingEnabled || state.isSavingTargetState) {
		return;
	}

	const light = (state.currentStatus.lights || []).find((entry) => entry.id === lightId);
	if (!light) {
		return;
	}

	const nextKnownDevices = (state.currentStatus.knownDevices || []).map((device) => (
		device.id === lightId
			? { ...device, enabled: !(light.enabled !== false) }
			: device
	));

	try {
		store.setTargetSaveState(true);
		store.setStatus(applyOptimisticKnownDeviceState(state.currentStatus, nextKnownDevices));
		const payload = await saveTargets(nextKnownDevices);
		store.setStatus(payload);
	} catch (error) {
		showError(error);
		try {
			await refreshStatus();
		} catch (refreshError) {
			showError(refreshError);
		}
	} finally {
		store.setTargetSaveState(false);
	}
}

async function handleToggleAddressGroup(addressGroup, enabled) {
	if (!state.currentStatus || !state.currentStatus.manualTargetingEnabled || state.isSavingTargetState) {
		return;
	}

	const groupLightIds = new Set(
		(state.currentStatus.lights || [])
			.filter((light) => light.addressGroup === addressGroup)
			.map((light) => light.id)
	);
	const nextKnownDevices = (state.currentStatus.knownDevices || []).map((device) => (
		groupLightIds.has(device.id)
			? { ...device, enabled }
			: device
	));

	try {
		store.setTargetSaveState(true);
		store.setStatus(applyOptimisticKnownDeviceState(state.currentStatus, nextKnownDevices));
		const payload = await saveAddressGroupState(addressGroup, enabled);
		store.setStatus(payload);
	} catch (error) {
		showError(error);
		try {
			await refreshStatus();
		} catch (refreshError) {
			showError(refreshError);
		}
	} finally {
		store.setTargetSaveState(false);
	}
}

const liveBrightnessQueue = createLiveCommandQueue({
	dispatchIntervalMs: LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS,
	refreshDelayMs: LIVE_BRIGHTNESS_REFRESH_DELAY_MS,
	save: saveLiveBrightness,
	onSuccess: (payload, brightnessPercent) => {
		if (!state.currentStatus) {
			return;
		}

		store.setStatus({
			...state.currentStatus,
			liveBrightnessPercent: payload && payload.result && payload.result.brightnessPercent != null
				? payload.result.brightnessPercent
				: brightnessPercent
		});
	},
	onError: (error) => {
		showError(error);
		if (state.currentStatus) {
			updateBrightnessSliderDisplay(state.currentStatus.liveBrightnessPercent);
		}
	},
	refresh: () => {
		if (!state.isSubmitting && !state.isAdjustingLiveBrightness && !liveBrightnessQueue.isRequestInFlight()) {
			refreshStatus().catch(showError);
		}
	}
});

const scenePreviewQueue = createLiveCommandQueue({
	dispatchIntervalMs: LIVE_SCENE_PREVIEW_DISPATCH_INTERVAL_MS,
	refreshDelayMs: LIVE_SCENE_PREVIEW_REFRESH_DELAY_MS,
	save: saveScenePreview,
	onSuccess: () => {
		store.setLiveScenePreview(true);
	},
	onError: (error) => {
		showError(error);
	},
	refresh: () => {
		if (!state.isSubmitting && !state.editingSceneId && !scenePreviewQueue.isRequestInFlight()) {
			refreshStatus().catch(showError);
		}
	}
});

const actions = {
	onApplyScene: handleApplyScene,
	onSetEditingScene: openSceneEditor,
	onClearEditingScene: () => closeSceneEditor(),
	onUpdateEditingSceneDraft: (draft) => {
		store.setEditingSceneDraft(draft);
	},
	onSaveEditingScene: handleSaveEditingScene,
	onToggleTarget: handleToggleTarget,
	onToggleAddressGroup: handleToggleAddressGroup
};

store.subscribe(renderApp);
renderApp();

elements.discoverButton.addEventListener("click", async () => {
	try {
		store.setActivity("Rescanning LAN and refreshing discovered devices...", { kind: "discover" });
		store.setSubmitting(true);
		const payload = await discoverLan();
		store.setStatus(payload);
		store.setActivity(
			`Rescan complete. ${payload.onlineCount} bulb(s) online across ${payload.addressGroups.length} subnet group(s).`,
			{ kind: "success", autoClearMs: 5000 }
		);
	} catch (error) {
		showError(error);
		store.setActivity("");
	} finally {
		store.setSubmitting(false);
	}
});

elements.restartButton.addEventListener("click", async () => {
	try {
		store.setActivity("Restarting server and reloading controller state...", { kind: "restart" });
		store.setSubmitting(true);
		await restartServer();
		const payload = await waitForServerReady();
		store.setStatus(payload);
		store.setActivity("Server restart complete. Fresh state loaded.", {
			kind: "success",
			autoClearMs: 5000
		});
	} catch (error) {
		showError(error);
		store.setActivity("");
	} finally {
		store.setSubmitting(false);
	}
});

elements.resetDefaultsButton.addEventListener("click", async () => {
	if (!state.isConfirmingReset) {
		armResetConfirmation();
		return;
	}

	try {
		clearResetConfirmation();
		store.setActivity("Resetting live state to shipped defaults and rescanning the LAN...", { kind: "reset" });
		store.setSubmitting(true);
		closeSceneEditor({ scheduleRefresh: false });
		liveBrightnessQueue.clearPending();
		scenePreviewQueue.clearPending();
		const payload = await resetToDefaults();
		store.setStatus(payload.status);
		store.setActivity(
			`Reset complete. ${payload.status.onlineCount} bulb(s) online across ${payload.status.addressGroups.length} subnet group(s).`,
			{ kind: "success", autoClearMs: 5000 }
		);
	} catch (error) {
		showError(error);
		store.setActivity("");
	} finally {
		store.setResetConfirmation(false);
		store.setSubmitting(false);
	}
});

elements.transitionDurationSlider.addEventListener("input", (event) => {
	store.setAdjustingTransitionDuration(true);
	updateTransitionSliderDisplay(Number(event.target.value));
});

elements.transitionDurationSlider.addEventListener("change", async (event) => {
	try {
		store.setSubmitting(true);
		const payload = await saveTransitionDuration(Number(event.target.value));
		store.setStatus(payload);
	} catch (error) {
		showError(error);
		updateTransitionSliderDisplay(
			state.currentStatus && state.currentStatus.transitionDurationMs != null
				? state.currentStatus.transitionDurationMs
				: 1000
		);
	} finally {
		store.setAdjustingTransitionDuration(false);
		store.setSubmitting(false);
	}
});

elements.transitionDurationSlider.addEventListener("blur", () => {
	if (!state.isSubmitting) {
		store.setAdjustingTransitionDuration(false);
		updateTransitionSliderDisplay(
			state.currentStatus && state.currentStatus.transitionDurationMs != null
				? state.currentStatus.transitionDurationMs
				: 1000
		);
	}
});

elements.brightnessSlider.addEventListener("input", (event) => {
	const nextBrightnessPercent = Number(event.target.value);
	store.setAdjustingLiveBrightness(true);
	updateBrightnessSliderDisplay(nextBrightnessPercent);
	liveBrightnessQueue.queue(nextBrightnessPercent);
});

elements.brightnessSlider.addEventListener("change", async (event) => {
	store.setAdjustingLiveBrightness(false);
	liveBrightnessQueue.queue(Number(event.target.value));
	await liveBrightnessQueue.flushNow();
});

elements.brightnessSlider.addEventListener("blur", () => {
	store.setAdjustingLiveBrightness(false);
	if (!liveBrightnessQueue.isRequestInFlight() && state.currentStatus) {
		updateBrightnessSliderDisplay(state.currentStatus.liveBrightnessPercent);
		liveBrightnessQueue.scheduleRefresh();
	}
});

setInterval(() => {
	if (!state.isSubmitting && !state.isAdjustingLiveBrightness && !liveBrightnessQueue.isRequestInFlight() && !state.editingSceneId) {
		refreshStatus().catch(showError);
	}
}, STATUS_POLL_INTERVAL_MS);

refreshStatus().catch(showError);
