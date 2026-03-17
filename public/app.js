const statusText = document.querySelector("#status-text");
const warningText = document.querySelector("#warning-text");
const targetedCount = document.querySelector("#targeted-count");
const sceneGrid = document.querySelector("#scene-grid");
const sceneEditorSection = document.querySelector("#scene-editor-section");
const sceneEditorContainer = document.querySelector("#scene-editor-container");
const lightGrid = document.querySelector("#light-grid");
const discoverButton = document.querySelector("#discover-button");
const restartButton = document.querySelector("#restart-button");
const activityText = document.querySelector("#activity-text");
const transitionDurationSlider = document.querySelector("#transition-duration-slider");
const transitionDurationValue = document.querySelector("#transition-duration-value");
const brightnessSlider = document.querySelector("#brightness-slider");
const brightnessValue = document.querySelector("#brightness-value");

let isSubmitting = false;
let currentStatus = null;
let activeActivity = "";
let activityClearTimer = null;
let sceneFeedbackId = null;
let sceneFeedbackLabel = null;
let sceneFeedbackTimer = null;
let isAdjustingTransitionDuration = false;
let isAdjustingLiveBrightness = false;
let isSavingTargetState = false;
let editingSceneId = null;
let editingSceneDraft = null;
let hasLiveScenePreview = false;

const LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS = 100;
const LIVE_BRIGHTNESS_REFRESH_DELAY_MS = 300;
const LIVE_SCENE_PREVIEW_DISPATCH_INTERVAL_MS = 100;
const LIVE_SCENE_PREVIEW_REFRESH_DELAY_MS = 400;
const STATUS_POLL_INTERVAL_MS = 3000;
const SCENE_FEEDBACK_DURATION_MS = 4000;
const MIN_SCENE_BRIGHTNESS_PERCENT = 5;
const FALLBACK_DEFAULT_SCENE_KELVIN = 5500;
const supportsOklch = typeof CSS !== "undefined"
	&& typeof CSS.supports === "function"
	&& CSS.supports("color", "oklch(62% 0.16 210)");

function setBusyState(nextBusyState) {
	isSubmitting = nextBusyState;
	for (const button of document.querySelectorAll("[data-scene-trigger-id], [data-scene-editor-id], [data-scene-editor-action]")) {
		button.disabled = nextBusyState;
	}
	for (const button of document.querySelectorAll("[data-address-group]")) {
		button.disabled = nextBusyState;
	}
	discoverButton.disabled = nextBusyState;
	restartButton.disabled = nextBusyState;
	transitionDurationSlider.disabled = nextBusyState;
	brightnessSlider.disabled = nextBusyState || ((currentStatus?.lights?.filter((light) => light.targeted).length ?? 0) === 0);
	discoverButton.dataset.busy = String(nextBusyState && activeActivity === "discover");
	restartButton.dataset.busy = String(nextBusyState && activeActivity === "restart");
	discoverButton.textContent = activeActivity === "discover" && nextBusyState ? "Rescanning..." : "Rescan LAN";
	restartButton.textContent = activeActivity === "restart" && nextBusyState ? "Restarting..." : "Restart Server";
}

function setTargetSaveState(nextSavingTargetState) {
	isSavingTargetState = nextSavingTargetState;
	if (currentStatus) {
		renderLights(currentStatus.lights ?? []);
	}
}

function formatDurationLabel(durationMs) {
	return `${Math.round(durationMs)}ms`;
}

function formatBrightnessLabel(brightnessPercent) {
	if (brightnessPercent == null) {
		return "--";
	}

	return `${Math.round(brightnessPercent)}%`;
}

function formatPercentLabel(value) {
	return `${Math.round(value)}%`;
}

function formatKelvinLabel(kelvin) {
	return `${Math.round(kelvin)}K`;
}

function clampNumber(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function getEditableSceneBrightnessPercent(brightnessPercent, colorMode) {
	const normalizedBrightness = clampNumber(Number(brightnessPercent) || 0, 0, 100);
	return colorMode === "off"
		? 0
		: clampNumber(normalizedBrightness, MIN_SCENE_BRIGHTNESS_PERCENT, 100);
}

function getDefaultSceneKelvin() {
	return Math.round(currentStatus?.defaultSceneKelvin ?? FALLBACK_DEFAULT_SCENE_KELVIN);
}

function deriveSceneId(name) {
	const normalized = String(name ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.trim()
		.replace(/[\s-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return normalized;
}

function updateSliderProgress(slider, value) {
	const min = Number(slider.min || 0);
	const max = Number(slider.max || 100);
	const numericValue = Number(value);
	const ratio = max === min ? 0 : ((numericValue - min) / (max - min)) * 100;
	slider.style.setProperty("--slider-progress", `${Math.min(100, Math.max(0, ratio))}%`);
}

function setTransitionDurationDisplay(durationMs) {
	const nextValue = String(Math.round(durationMs));
	transitionDurationSlider.value = nextValue;
	transitionDurationValue.textContent = formatDurationLabel(durationMs);
	updateSliderProgress(transitionDurationSlider, nextValue);
}

function setBrightnessDisplay(brightnessPercent) {
	const nextValue = String(Math.round(brightnessPercent ?? 0));
	brightnessSlider.value = nextValue;
	brightnessValue.textContent = formatBrightnessLabel(brightnessPercent);
	updateSliderProgress(brightnessSlider, nextValue);
}

function setActivity(message = "", { autoClearMs = 0 } = {}) {
	if (activityClearTimer) {
		clearTimeout(activityClearTimer);
		activityClearTimer = null;
	}

	activeActivity = message ?
		(message.startsWith("Rescanning") ? "discover" : message.startsWith("Restarting") ? "restart" : "other") :
		"";
	activityText.hidden = !message;
	activityText.textContent = message;
	if (!message) {
		discoverButton.dataset.busy = "false";
		restartButton.dataset.busy = "false";
		if (!isSubmitting) {
			discoverButton.textContent = "Rescan LAN";
			restartButton.textContent = "Restart Server";
		}
	} else if (activeActivity === "discover") {
		discoverButton.dataset.busy = "true";
		discoverButton.textContent = "Rescanning...";
	} else if (activeActivity === "restart") {
		restartButton.dataset.busy = "true";
		restartButton.textContent = "Restarting...";
	}

	if (message && autoClearMs > 0) {
		activityClearTimer = setTimeout(() => {
			activityClearTimer = null;
			if (!isSubmitting) {
				setActivity("");
			}
		}, autoClearMs);
	}
}

function setSceneFeedback(sceneId, label) {
	sceneFeedbackId = sceneId;
	sceneFeedbackLabel = label;
	renderScenes(currentStatus?.scenes ?? []);

	if (sceneFeedbackTimer) {
		clearTimeout(sceneFeedbackTimer);
	}

	sceneFeedbackTimer = setTimeout(() => {
		sceneFeedbackTimer = null;
		sceneFeedbackId = null;
		sceneFeedbackLabel = null;
		renderScenes(currentStatus?.scenes ?? []);
	}, SCENE_FEEDBACK_DURATION_MS);
}

function applyLocalTargetState(enabledTargetIds, disabledTargetIds) {
	if (!currentStatus) {
		return;
	}

	const enabledIdSet = new Set(enabledTargetIds);
	const disabledIdSet = new Set(disabledTargetIds);
	const nextLights = (currentStatus.lights ?? []).map((light) => {
		const enabled = enabledIdSet.has(light.id) || !disabledIdSet.has(light.id);
		return {
			...light,
			enabled,
			targeted: enabled
		};
	});

	const addressGroups = (currentStatus.addressGroups ?? []).map((group) => {
		const groupLights = nextLights.filter((light) => light.addressGroup === group.key);
		const enabledCount = groupLights.filter((light) => light.enabled).length;
		return {
			...group,
			enabledCount,
			targetedCount: enabledCount,
			fullyEnabled: enabledCount === group.count && group.count > 0
		};
	});

	currentStatus = {
		...currentStatus,
		enabledTargetIds: [...enabledTargetIds],
		disabledTargetIds: [...disabledTargetIds],
		targetedCount: enabledIdSet.size,
		addressGroups,
		lights: nextLights
	};

	renderLights(currentStatus.lights);
	targetedCount.textContent = `${currentStatus.targetedCount} / ${currentStatus.discoveredCount}`;
}

function createLiveCommandQueue({
	dispatchIntervalMs,
	refreshDelayMs = 0,
	save,
	onSuccess,
	onError,
	refresh
}) {
	let requestInFlight = false;
	let pendingPayload = null;
	let dispatchTimer = null;
	let refreshTimer = null;
	const idleResolvers = [];

	function resolveIdleWaiters() {
		if (requestInFlight || pendingPayload != null || dispatchTimer) {
			return;
		}

		for (const resolve of idleResolvers.splice(0)) {
			resolve();
		}
	}

	function scheduleRefresh() {
		if (!refresh || refreshDelayMs <= 0) {
			return;
		}

		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}

		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			refresh();
		}, refreshDelayMs);
	}

	async function flush() {
		if (requestInFlight || pendingPayload == null) {
			resolveIdleWaiters();
			return;
		}

		const nextPayload = pendingPayload;
		pendingPayload = null;
		requestInFlight = true;

		try {
			const result = await save(nextPayload);
			onSuccess?.(result, nextPayload);
		} catch (error) {
			onError?.(error, nextPayload);
		} finally {
			requestInFlight = false;
			if (pendingPayload != null) {
				void flush();
			} else {
				scheduleRefresh();
				resolveIdleWaiters();
			}
		}
	}

	return {
		queue(payload) {
			pendingPayload = payload;
			if (dispatchTimer) {
				return;
			}

			dispatchTimer = setTimeout(() => {
				dispatchTimer = null;
				void flush();
			}, dispatchIntervalMs);
		},
		async flushNow() {
			if (dispatchTimer) {
				clearTimeout(dispatchTimer);
				dispatchTimer = null;
			}

			if (pendingPayload != null) {
				await flush();
			}

			if (requestInFlight || pendingPayload != null || dispatchTimer) {
				await this.waitForIdle();
			}
		},
		waitForIdle() {
			if (!requestInFlight && pendingPayload == null && !dispatchTimer) {
				return Promise.resolve();
			}

			return new Promise((resolve) => {
				idleResolvers.push(resolve);
			});
		},
		clearPending() {
			if (dispatchTimer) {
				clearTimeout(dispatchTimer);
				dispatchTimer = null;
			}
			if (refreshTimer) {
				clearTimeout(refreshTimer);
				refreshTimer = null;
			}
			pendingPayload = null;
			resolveIdleWaiters();
		},
		scheduleRefresh,
		isRequestInFlight() {
			return requestInFlight;
		}
	};
}

function hsbToRgb(hue, saturation, brightness) {
	const s = saturation / 100;
	const v = brightness / 100;
	const chroma = v * s;
	const huePrime = ((hue % 360) + 360) % 360 / 60;
	const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
	let red = 0;
	let green = 0;
	let blue = 0;

	if (huePrime >= 0 && huePrime < 1) {
		red = chroma;
		green = x;
	} else if (huePrime < 2) {
		red = x;
		green = chroma;
	} else if (huePrime < 3) {
		green = chroma;
		blue = x;
	} else if (huePrime < 4) {
		green = x;
		blue = chroma;
	} else if (huePrime < 5) {
		red = x;
		blue = chroma;
	} else {
		red = chroma;
		blue = x;
	}

	const match = v - chroma;
	return {
		red: Math.round((red + match) * 255),
		green: Math.round((green + match) * 255),
		blue: Math.round((blue + match) * 255)
	};
}

function interpolateRgb(left, right, ratio) {
	return {
		red: Math.round(left.red + ((right.red - left.red) * ratio)),
		green: Math.round(left.green + ((right.green - left.green) * ratio)),
		blue: Math.round(left.blue + ((right.blue - left.blue) * ratio))
	};
}

function kelvinToRgb(kelvin) {
	const anchors = [
		{ kelvin: 1500, rgb: { red: 255, green: 170, blue: 95 } },
		{ kelvin: 2200, rgb: { red: 255, green: 196, blue: 140 } },
		{ kelvin: 2700, rgb: { red: 255, green: 218, blue: 182 } },
		{ kelvin: 3200, rgb: { red: 255, green: 231, blue: 210 } },
		{ kelvin: 4000, rgb: { red: 255, green: 242, blue: 229 } },
		{ kelvin: 5000, rgb: { red: 250, green: 247, blue: 240 } },
		{ kelvin: 6500, rgb: { red: 241, green: 244, blue: 255 } },
		{ kelvin: 9000, rgb: { red: 222, green: 232, blue: 255 } }
	];

	if (kelvin <= anchors[0].kelvin) {
		return anchors[0].rgb;
	}

	if (kelvin >= anchors.at(-1).kelvin) {
		return anchors.at(-1).rgb;
	}

	for (let index = 0; index < anchors.length - 1; index += 1) {
		const left = anchors[index];
		const right = anchors[index + 1];
		if (kelvin >= left.kelvin && kelvin <= right.kelvin) {
			const ratio = (kelvin - left.kelvin) / (right.kelvin - left.kelvin);
			return interpolateRgb(left.rgb, right.rgb, ratio);
		}
	}

	return anchors.at(-1).rgb;
}

function rgbToCss({ red, green, blue }) {
	return `rgb(${red}, ${green}, ${blue})`;
}

function srgbChannelToLinear(channel) {
	const normalized = channel / 255;
	if (normalized <= 0.04045) {
		return normalized / 12.92;
	}

	return ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToOklch({ red, green, blue }) {
	const linearRed = srgbChannelToLinear(red);
	const linearGreen = srgbChannelToLinear(green);
	const linearBlue = srgbChannelToLinear(blue);

	const l = (0.4122214708 * linearRed) + (0.5363325363 * linearGreen) + (0.0514459929 * linearBlue);
	const m = (0.2119034982 * linearRed) + (0.6806995451 * linearGreen) + (0.1073969566 * linearBlue);
	const s = (0.0883024619 * linearRed) + (0.2817188376 * linearGreen) + (0.6299787005 * linearBlue);

	const lRoot = Math.cbrt(l);
	const mRoot = Math.cbrt(m);
	const sRoot = Math.cbrt(s);

	const lightness = (0.2104542553 * lRoot) + (0.793617785 * mRoot) - (0.0040720468 * sRoot);
	const a = (1.9779984951 * lRoot) - (2.428592205 * mRoot) + (0.4505937099 * sRoot);
	const b = (0.0259040371 * lRoot) + (0.7827717662 * mRoot) - (0.808675766 * sRoot);
	const chroma = Math.sqrt((a ** 2) + (b ** 2));
	const hue = (Math.atan2(b, a) * (180 / Math.PI) + 360) % 360;

	return {
		lightness,
		chroma,
		hue
	};
}

function toOklchCss(baseRgb, brightnessPercent, fallbackRgb, { floor = 0.38, exponent = 0.58 } = {}) {
	if (!supportsOklch) {
		return rgbToCss(fallbackRgb);
	}

	const brightnessRatio = clampNumber(brightnessPercent / 100, 0, 1);
	if (brightnessRatio <= 0) {
		return "rgb(0, 0, 0)";
	}

	const oklch = rgbToOklch(baseRgb);
	const liftedBrightnessRatio = floor + ((brightnessRatio ** exponent) * (1 - floor));
	const adjustedLightness = clampNumber(oklch.lightness * liftedBrightnessRatio, 0, 1);
	const adjustedChroma = oklch.chroma * (0.9 + (brightnessRatio * 0.1));
	return `oklch(${(adjustedLightness * 100).toFixed(2)}% ${adjustedChroma.toFixed(4)} ${oklch.hue.toFixed(2)})`;
}

function compressSwatchBrightness(brightness) {
	return clampNumber(Number(brightness) || 0, 0, 100);
}

function scaleRgbBrightness(rgb, brightness) {
	const factor = compressSwatchBrightness(brightness) / 100;
	return {
		red: Math.round(rgb.red * factor),
		green: Math.round(rgb.green * factor),
		blue: Math.round(rgb.blue * factor)
	};
}

function scaleKelvinSwatchBrightness(rgb, brightness) {
	const factor = (55 + (brightness * 0.45)) / 100;
	return {
		red: Math.round(rgb.red * factor),
		green: Math.round(rgb.green * factor),
		blue: Math.round(rgb.blue * factor)
	};
}

function getPerceptualHueColor(hue, saturation, brightnessPercent) {
	const normalizedSaturation = clampNumber(Math.round(saturation), 0, 100);
	const normalizedBrightness = clampNumber(Math.round(brightnessPercent), 0, 100);
	const baseRgb = hsbToRgb(hue, normalizedSaturation, 100);
	const fallbackRgb = hsbToRgb(hue, normalizedSaturation, normalizedBrightness);

	return {
		cssColor: toOklchCss(baseRgb, normalizedBrightness, fallbackRgb, {
			floor: 0.38,
			exponent: 0.58
		}),
		rgb: fallbackRgb
	};
}

function getPerceptualKelvinColor(kelvin, brightnessPercent) {
	const normalizedBrightness = clampNumber(Math.round(brightnessPercent), 0, 100);
	const baseRgb = kelvinToRgb(kelvin);
	const fallbackRgb = scaleKelvinSwatchBrightness(baseRgb, normalizedBrightness);

	return {
		cssColor: toOklchCss(baseRgb, normalizedBrightness, fallbackRgb, {
			floor: 0.54,
			exponent: 0.52
		}),
		rgb: fallbackRgb
	};
}

function getSceneButtonAppearance(scene) {
	if (scene.power === "off" || Number(scene.brightness ?? 0) <= 0) {
		return {
			cssColor: "rgb(0, 0, 0)",
			rgb: { red: 0, green: 0, blue: 0 }
		};
	}

	if ((scene.saturation ?? 0) <= 0.08) {
		return getPerceptualKelvinColor(
			scene.kelvin ?? getDefaultSceneKelvin(),
			Math.round((scene.brightness ?? 0) * 100)
		);
	}

	return getPerceptualHueColor(
		scene.hue ?? 0,
		Math.max(22, Math.round((scene.saturation ?? 0) * 100)),
		Math.round((scene.brightness ?? 0) * 100)
	);
}

function getStateSwatchColor(currentState) {
	if (!currentState || currentState.power !== "on" || currentState.brightness <= 0) {
		return "transparent";
	}

	if (currentState.saturation <= 8) {
		return getPerceptualKelvinColor(currentState.kelvin, currentState.brightness).cssColor;
	}

	return getPerceptualHueColor(
		currentState.hue,
		currentState.saturation,
		currentState.brightness
	).cssColor;
}

function getStateLabel(currentState) {
	if (!currentState) {
		return "awaiting response";
	}

	if (currentState.power !== "on") {
		return "Off";
	}

	if (currentState.saturation <= 8) {
		return `${Math.round(currentState.brightness)}% · ${Math.round(currentState.kelvin)}K`;
	}

	return `${Math.round(currentState.brightness)}% · ${Math.round(currentState.hue)}° hue`;
}

function isLightEnabled(light) {
	return light.enabled !== false;
}

function createLightCard() {
	const card = document.createElement("article");
	card.className = "light-card";
	const header = document.createElement("div");
	header.className = "light-card-header";
	const swatch = document.createElement("span");
	swatch.className = "light-swatch";
	const title = document.createElement("h3");
	header.append(swatch, title);
	const address = document.createElement("p");
	address.className = "light-meta light-identifier-meta";
	const identifier = document.createElement("p");
	identifier.className = "light-meta light-identifier-meta";
	const stateLabel = document.createElement("p");
	stateLabel.className = "light-meta light-state-meta";

	const pillRow = document.createElement("div");
	pillRow.className = "pill-row";

	const onlinePill = document.createElement("span");
	onlinePill.className = "pill";
	const onlineIcon = document.createElement("img");
	onlineIcon.className = "pill-icon";
	onlineIcon.alt = "";
	onlineIcon.setAttribute("aria-hidden", "true");
	onlinePill.append(onlineIcon);
	const targetingPill = document.createElement("button");
	targetingPill.type = "button";
	targetingPill.className = "pill pill-toggle";

	pillRow.append(targetingPill);
	pillRow.append(onlinePill);

	card.append(header, stateLabel, address, identifier, pillRow);

	return card;
}

function updateLightCard(card, light) {
	const enabled = isLightEnabled(light);
	const swatch = card.querySelector(".light-swatch");
	const title = card.querySelector("h3");
	const address = card.querySelectorAll(".light-identifier-meta")[0];
	const identifier = card.querySelectorAll(".light-identifier-meta")[1];
	const stateLabel = card.querySelector(".light-state-meta");
	const onlinePill = card.querySelector(".pill:not(.pill-toggle)");
	const onlineIcon = card.querySelector(".pill-icon");
	const targetingPill = card.querySelector(".pill-toggle");

	card.dataset.enabled = String(enabled);
	card.dataset.lightId = light.id;
	if (!light.currentState || light.currentState.power !== "on" || light.currentState.brightness <= 0) {
		swatch.dataset.power = "off";
		swatch.style.background = "";
		swatch.setAttribute("aria-label", "Bulb is off");
	} else {
		swatch.dataset.power = "on";
		swatch.style.background = getStateSwatchColor(light.currentState);
		swatch.setAttribute("aria-label", "Bulb is on");
	}
	title.textContent = light.label;
	address.textContent = light.address;
	identifier.textContent = `ID: ${light.id}`;
	stateLabel.textContent = getStateLabel(light.currentState);
	stateLabel.dataset.pending = String(!light.currentState);

	onlinePill.className = `pill ${light.status === "on" ? "online" : "offline"}`;
	onlinePill.setAttribute("aria-label", light.status === "on" ? "Online" : "Offline");
	onlinePill.title = light.status === "on" ? "Online" : "Offline";
	onlineIcon.src = light.status === "on"
		? "/assets/iconoir/regular/wifi.svg"
		: "/assets/iconoir/solid/warning-triangle.svg";

	targetingPill.className = `pill pill-toggle ${enabled ? "enabled" : "disabled"}`;
	targetingPill.textContent = enabled ? "ENABLED" : "DISABLED";
	targetingPill.disabled = isSavingTargetState || !currentStatus?.manualTargetingEnabled;
	targetingPill.setAttribute(
		"aria-label",
		enabled ? `Disable ${light.label}` : `Enable ${light.label}`
	);
	targetingPill.onclick = currentStatus?.manualTargetingEnabled ? () => toggleTarget(light.id) : null;
}

function createDeviceGroupSection() {
	const wrapper = document.createElement("section");
	wrapper.className = "device-group";

	const header = document.createElement("div");
	header.className = "device-group-header";

	const headerText = document.createElement("div");
	headerText.className = "device-group-summary";
	const title = document.createElement("h3");
	const stats = document.createElement("div");
	stats.className = "device-group-stats";

	const onlineStat = document.createElement("span");
	onlineStat.className = "device-group-stat";

	const enabledStat = document.createElement("span");
	enabledStat.className = "device-group-stat";

	stats.append(onlineStat, enabledStat);
	headerText.append(title, stats);

	const actions = document.createElement("div");
	actions.className = "device-group-actions";

	const enableButton = document.createElement("button");
	enableButton.className = "device-group-toggle";
	enableButton.textContent = "Enable All";

	const disableButton = document.createElement("button");
	disableButton.className = "device-group-toggle";
	disableButton.textContent = "Disable All";

	actions.append(enableButton, disableButton);
	header.append(headerText, actions);

	const grid = document.createElement("div");
	grid.className = "device-group-grid";

	wrapper.append(header, grid);
	return wrapper;
}

function updateDeviceGroupSection(wrapper, group, groupLights) {
	const title = wrapper.querySelector("h3");
	const [onlineStat, enabledStat] = wrapper.querySelectorAll(".device-group-stat");
	const [enableButton, disableButton] = wrapper.querySelectorAll(".device-group-toggle");
	const grid = wrapper.querySelector(".device-group-grid");

	wrapper.dataset.enabled = String(group.enabledCount > 0);
	wrapper.dataset.addressGroup = group.key;
	title.textContent = group.label;
	onlineStat.textContent = `${group.onlineCount}/${group.count} online`;
	enabledStat.textContent = `${group.enabledCount} enabled`;
	enableButton.dataset.addressGroup = group.key;
	disableButton.dataset.addressGroup = group.key;
	enableButton.disabled = isSavingTargetState || !currentStatus?.manualTargetingEnabled;
	disableButton.disabled = isSavingTargetState || !currentStatus?.manualTargetingEnabled;
	enableButton.onclick = () => toggleAddressGroup(group.key, true);
	disableButton.onclick = () => toggleAddressGroup(group.key, false);

	const existingCardsById = new Map(
		[...grid.querySelectorAll(".light-card")].map((card) => [card.dataset.lightId, card])
	);
	const nextCards = groupLights.map((light) => {
		const card = existingCardsById.get(light.id) ?? createLightCard();
		updateLightCard(card, light);
		return card;
	});
	grid.replaceChildren(...nextCards);
}

function renderLights(lights) {
	const groupedLights = lights.reduce((groups, light) => {
		if (!groups.has(light.addressGroup)) {
			groups.set(light.addressGroup, []);
		}
		groups.get(light.addressGroup).push(light);
		return groups;
	}, new Map());

	const existingGroupsByKey = new Map(
		[...lightGrid.querySelectorAll(".device-group")].map((wrapper) => [wrapper.dataset.addressGroup, wrapper])
	);
	const nextGroups = (currentStatus?.addressGroups ?? []).map((group) => {
		const wrapper = existingGroupsByKey.get(group.key) ?? createDeviceGroupSection();
		const groupLights = (groupedLights.get(group.key) ?? [])
			.slice()
			.sort((left, right) => left.label.localeCompare(right.label));
		updateDeviceGroupSection(wrapper, group, groupLights);
		return wrapper;
	});

	lightGrid.replaceChildren(...nextGroups);
}

function sceneDescription(scene) {
	return scene.description;
}

function sceneSettingsLabel(scene) {
	if (scene.power === "off") {
		return "Power: Off";
	}

	if ((scene.saturation ?? 0) <= 0.08) {
		return `${Math.round(scene.brightness * 100)}% brightness · ${scene.kelvin}K`;
	}

	return `${Math.round(scene.brightness * 100)}% brightness · ${Math.round(scene.hue)}° hue`;
}

function makeSceneDraft(scene) {
	const colorMode = scene.power === "off" ? "off" : (scene.saturation ?? 0) <= 0.08 ? "white" : "color";
	return {
		name: scene.name,
		description: scene.description ?? "",
		hue: Math.round(scene.hue ?? 0),
		saturation: Math.round((scene.saturation ?? 0) * 100),
		brightness: getEditableSceneBrightnessPercent(Math.round((scene.brightness ?? 0) * 100), colorMode),
		kelvin: Math.round(scene.kelvin ?? getDefaultSceneKelvin()),
		colorMode
	};
}

function buildEditingSceneValues() {
	if (!editingSceneDraft) {
		return null;
	}

	return {
		power: editingSceneDraft.colorMode === "off" ? "off" : "on",
		hue: editingSceneDraft.hue,
		saturation: editingSceneDraft.colorMode === "white" ? 0 : editingSceneDraft.saturation / 100,
		brightness: editingSceneDraft.colorMode === "off"
			? 0
			: getEditableSceneBrightnessPercent(editingSceneDraft.brightness, editingSceneDraft.colorMode) / 100,
		kelvin: editingSceneDraft.colorMode === "white"
			? editingSceneDraft.kelvin
			: getDefaultSceneKelvin()
	};
}

function hasLiveScenePreviewTargets() {
	return (currentStatus?.lights?.some((light) => light.targeted && light.status === "on")) ?? false;
}

function getSceneButtonBorder(scene, rgb) {
	if (scene.power === "off") {
		return "rgba(255, 255, 255, 0.12)";
	}

	if ((scene.saturation ?? 0) <= 0.08) {
		return "rgba(31, 28, 24, 0.16)";
	}

	return "rgba(255, 255, 255, 0.16)";
}

function getSceneIconFilter(rgb) {
	const luminance = ((0.2126 * rgb.red) + (0.7152 * rgb.green) + (0.0722 * rgb.blue)) / 255;
	return luminance > 0.68
		? "brightness(0) saturate(100%)"
		: "brightness(0) invert(1)";
}

function getSceneButtonForeground(rgb) {
	const luminance = ((0.2126 * rgb.red) + (0.7152 * rgb.green) + (0.0722 * rgb.blue)) / 255;
	return luminance > 0.68 ? "#1f1c18" : "#ffffff";
}

function setSceneEditor(scene) {
	editingSceneId = scene.id;
	editingSceneDraft = makeSceneDraft(scene);
	hasLiveScenePreview = false;
	scenePreviewQueue.clearPending();
	renderScenes(currentStatus?.scenes ?? []);
	renderSceneEditor(currentStatus?.scenes ?? []);
	if (window.matchMedia?.("(max-width: 640px)")?.matches) {
		requestAnimationFrame(() => {
			sceneEditorSection.scrollIntoView({
				behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
				block: "start"
			});
		});
	}
}

function clearSceneEditor() {
	editingSceneId = null;
	editingSceneDraft = null;
	scenePreviewQueue.clearPending();
	renderScenes(currentStatus?.scenes ?? []);
	renderSceneEditor(currentStatus?.scenes ?? []);
	if (hasLiveScenePreview || scenePreviewQueue.isRequestInFlight()) {
		scenePreviewQueue.scheduleRefresh();
	}
	hasLiveScenePreview = false;
}

function getHueWheelPosition(hue, saturation) {
	const angle = ((Number(hue) % 360) * Math.PI) / 180;
	const radius = Math.max(0, Math.min(1, Number(saturation) / 100));
	return {
		x: 50 + (Math.cos(angle) * radius * 50),
		y: 50 + (Math.sin(angle) * radius * 50)
	};
}

function updateSceneDraftFromWheel(event, wheel, onChange) {
	const rect = wheel.getBoundingClientRect();
	const offsetX = event.clientX - rect.left - (rect.width / 2);
	const offsetY = event.clientY - rect.top - (rect.height / 2);
	const radius = rect.width / 2;
	const normalizedDistance = Math.min(1, Math.sqrt((offsetX ** 2) + (offsetY ** 2)) / radius);
	const angle = (Math.atan2(offsetY, offsetX) * (180 / Math.PI) + 360) % 360;

	editingSceneDraft = {
		...editingSceneDraft,
		hue: Math.round(angle),
		saturation: Math.round(normalizedDistance * 100)
	};
	onChange();
}

function renderSceneEditor(scenes) {
	const scene = scenes.find((entry) => entry.id === editingSceneId);
	sceneEditorContainer.replaceChildren();

	if (!scene || !editingSceneDraft) {
		sceneEditorSection.hidden = true;
		return;
	}

	sceneEditorSection.hidden = false;

	if (editingSceneId !== scene.id || !editingSceneDraft) {
		return;
	}

	const editor = document.createElement("div");
	editor.className = "scene-editor";
	const editorHeader = document.createElement("div");
	editorHeader.className = "scene-editor-header";
	const editorHeaderCopy = document.createElement("div");
	const editorTitle = document.createElement("h3");
	editorTitle.className = "scene-editor-title";
	editorTitle.textContent = `Editing Scene: ${scene.name}`;
	editorHeaderCopy.append(editorTitle);

	const fieldGrid = document.createElement("div");
	fieldGrid.className = "scene-editor-grid";

	const controlPanel = document.createElement("div");
	controlPanel.className = "scene-editor-control-panel";

	const modeField = document.createElement("div");
	modeField.className = "scene-editor-field scene-editor-mode-field";
	const modeLabel = document.createElement("span");
	modeLabel.textContent = "Light Mode";
	const modeControls = document.createElement("div");
	modeControls.className = "scene-editor-mode-controls";
	const modeToggle = document.createElement("div");
	modeToggle.className = "scene-mode-toggle";
	const colorModeButton = document.createElement("button");
	colorModeButton.type = "button";
	colorModeButton.className = "scene-mode-button";
	colorModeButton.textContent = "Color";
	const whiteModeButton = document.createElement("button");
	whiteModeButton.type = "button";
	whiteModeButton.className = "scene-mode-button";
	whiteModeButton.textContent = "White";
	const offModeButton = document.createElement("button");
	offModeButton.type = "button";
	offModeButton.className = "scene-mode-button";
	offModeButton.textContent = "Off";
	const modePreviewMeta = document.createElement("div");
	modePreviewMeta.className = "scene-editor-meta scene-editor-mode-meta";
	const modePreview = document.createElement("div");
	modePreview.className = "scene-editor-preview scene-editor-mode-preview";
	modeToggle.append(colorModeButton, whiteModeButton, offModeButton);
	modePreviewMeta.append(modePreview);
	modeControls.append(modeToggle, modePreviewMeta);
	modeField.append(modeLabel, modeControls);

	const nameField = document.createElement("label");
	nameField.className = "scene-editor-field";
	const nameLabel = document.createElement("span");
	nameLabel.textContent = "Name";
	const nameInput = document.createElement("input");
	nameInput.className = "scene-editor-input";
	nameInput.type = "text";
	nameInput.value = editingSceneDraft.name;
	nameField.append(nameLabel, nameInput);

	const descriptionField = document.createElement("label");
	descriptionField.className = "scene-editor-field";
	const descriptionLabel = document.createElement("span");
	descriptionLabel.textContent = "Description";
	const descriptionInput = document.createElement("input");
	descriptionInput.className = "scene-editor-input";
	descriptionInput.type = "text";
	descriptionInput.value = editingSceneDraft.description;
	descriptionField.append(descriptionLabel, descriptionInput);

	const hueField = document.createElement("div");
	hueField.className = "scene-editor-field scene-editor-color-field";
	const hueHeader = document.createElement("div");
	hueHeader.className = "scene-editor-field-header";
	const hueLabel = document.createElement("span");
	hueLabel.textContent = "Hue + Sat";
	const hueValue = document.createElement("div");
	hueValue.className = "scene-editor-value";
	const hueWheel = document.createElement("div");
	hueWheel.className = "scene-hue-wheel";
	const hueIndicator = document.createElement("div");
	hueIndicator.className = "scene-hue-indicator";
	hueWheel.append(hueIndicator);
	const hueMeta = document.createElement("div");
	hueMeta.className = "scene-editor-meta";
	hueHeader.append(hueLabel, hueValue);
	hueField.append(hueHeader, hueWheel, hueMeta);

	const kelvinField = document.createElement("label");
	kelvinField.className = "scene-editor-field scene-editor-color-field";
	const kelvinHeader = document.createElement("div");
	kelvinHeader.className = "scene-editor-field-header";
	const kelvinLabel = document.createElement("span");
	kelvinLabel.textContent = "White Temperature";
	const kelvinValue = document.createElement("div");
	kelvinValue.className = "scene-editor-value";
	const kelvinSlider = document.createElement("input");
	kelvinSlider.className = "transition-slider scene-editor-slider scene-kelvin-slider";
	kelvinSlider.type = "range";
	kelvinSlider.min = "1500";
	kelvinSlider.max = "9000";
	kelvinSlider.step = "100";
	const kelvinMeta = document.createElement("div");
	kelvinMeta.className = "scene-editor-meta";
	kelvinHeader.append(kelvinLabel, kelvinValue);
	kelvinField.append(kelvinHeader, kelvinSlider, kelvinMeta);

	const offField = document.createElement("div");
	offField.className = "scene-editor-field scene-editor-off-field";
	const offIcon = document.createElement("img");
	offIcon.className = "scene-editor-off-icon";
	offIcon.src = "/assets/iconoir/regular/prohibition.svg";
	offIcon.alt = "Off mode";
	offField.append(offIcon);

	const brightnessField = document.createElement("label");
	brightnessField.className = "scene-editor-field";
	const brightnessHeader = document.createElement("div");
	brightnessHeader.className = "scene-editor-field-header";
	const brightnessLabel = document.createElement("span");
	brightnessLabel.textContent = "Brightness";
	const brightnessValue = document.createElement("div");
	brightnessValue.className = "scene-editor-value";
	const brightnessSlider = document.createElement("input");
	brightnessSlider.className = "transition-slider scene-editor-slider";
	brightnessSlider.type = "range";
	brightnessSlider.min = String(MIN_SCENE_BRIGHTNESS_PERCENT);
	brightnessSlider.max = "100";
	brightnessSlider.step = "1";
	brightnessHeader.append(brightnessLabel, brightnessValue);
	brightnessField.append(brightnessHeader, brightnessSlider);

	controlPanel.append(brightnessField, hueField, kelvinField, offField);
	fieldGrid.append(controlPanel, modeField, nameField, descriptionField);

	const actions = document.createElement("div");
	actions.className = "scene-editor-actions";
	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.className = "scene-editor-button scene-editor-button-secondary";
	cancelButton.dataset.sceneEditorAction = "cancel";
	cancelButton.textContent = "Cancel";
	const saveButton = document.createElement("button");
	saveButton.type = "button";
	saveButton.className = "scene-editor-button scene-editor-button-primary";
	saveButton.dataset.sceneEditorAction = "save";
	saveButton.textContent = "Save";
	actions.append(cancelButton, saveButton);

	editorHeader.append(editorHeaderCopy, actions);
	editor.append(editorHeader, fieldGrid);
	sceneEditorContainer.append(editor);
	let isDraggingHueWheel = false;
	function queueEditorScenePreview() {
		if (!editingSceneDraft || !hasLiveScenePreviewTargets()) {
			return;
		}

		const nextPreview = buildEditingSceneValues();
		if (nextPreview) {
			scenePreviewQueue.queue(nextPreview);
		}
	}

	function updateEditorDisplay() {
		if (document.activeElement !== nameInput) {
			nameInput.value = editingSceneDraft.name;
		}
		if (document.activeElement !== descriptionInput) {
			descriptionInput.value = editingSceneDraft.description;
		}
			brightnessSlider.value = String(editingSceneDraft.brightness);
		updateSliderProgress(brightnessSlider, brightnessSlider.value);
		brightnessValue.textContent = formatPercentLabel(editingSceneDraft.brightness);
		colorModeButton.dataset.active = String(editingSceneDraft.colorMode === "color");
		whiteModeButton.dataset.active = String(editingSceneDraft.colorMode === "white");
		offModeButton.dataset.active = String(editingSceneDraft.colorMode === "off");
		hueField.hidden = editingSceneDraft.colorMode !== "color";
		kelvinField.hidden = editingSceneDraft.colorMode !== "white";
		offField.hidden = editingSceneDraft.colorMode !== "off";
		brightnessField.hidden = editingSceneDraft.colorMode === "off";
		kelvinSlider.value = String(editingSceneDraft.kelvin);
		updateSliderProgress(kelvinSlider, kelvinSlider.value);
		const hueText = `${Math.round(editingSceneDraft.hue)}° · ${Math.round(editingSceneDraft.saturation)}% sat`;
		const indicatorPosition = getHueWheelPosition(editingSceneDraft.hue, editingSceneDraft.saturation);
		hueIndicator.style.left = `${indicatorPosition.x}%`;
		hueIndicator.style.top = `${indicatorPosition.y}%`;
		const huePreviewColor = getPerceptualHueColor(
			editingSceneDraft.hue,
			editingSceneDraft.saturation,
			editingSceneDraft.brightness
		).cssColor;
		const kelvinText = formatKelvinLabel(editingSceneDraft.kelvin);
		const kelvinPreviewColor = getPerceptualKelvinColor(
			editingSceneDraft.kelvin,
			editingSceneDraft.brightness
		).cssColor;
		hueValue.textContent = hueText;
		kelvinValue.textContent = kelvinText;
		modePreview.style.background = editingSceneDraft.colorMode === "off"
			? "rgb(0, 0, 0)"
			: editingSceneDraft.colorMode === "white"
				? kelvinPreviewColor
				: huePreviewColor;
	}

	nameInput.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			name: event.target.value
		};
		updateEditorDisplay();
	});

	descriptionInput.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			description: event.target.value
		};
	});

	colorModeButton.addEventListener("click", () => {
		editingSceneDraft = {
			...editingSceneDraft,
			colorMode: "color",
			brightness: getEditableSceneBrightnessPercent(editingSceneDraft.brightness, "color")
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	whiteModeButton.addEventListener("click", () => {
		editingSceneDraft = {
			...editingSceneDraft,
			colorMode: "white",
			brightness: getEditableSceneBrightnessPercent(editingSceneDraft.brightness, "white")
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	offModeButton.addEventListener("click", () => {
		editingSceneDraft = {
			...editingSceneDraft,
			colorMode: "off"
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	brightnessSlider.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			brightness: getEditableSceneBrightnessPercent(event.target.value, editingSceneDraft.colorMode)
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	kelvinSlider.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			kelvin: Number(event.target.value)
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	kelvinSlider.addEventListener("change", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			kelvin: Number(event.target.value)
		};
		updateEditorDisplay();
		queueEditorScenePreview();
	});

	hueWheel.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		isDraggingHueWheel = true;
		hueWheel.setPointerCapture(event.pointerId);
		updateSceneDraftFromWheel(event, hueWheel, updateEditorDisplay);
		queueEditorScenePreview();
	});

	hueWheel.addEventListener("pointermove", (event) => {
		if (!isDraggingHueWheel) {
			return;
		}

		updateSceneDraftFromWheel(event, hueWheel, updateEditorDisplay);
		queueEditorScenePreview();
	});

	hueWheel.addEventListener("pointerup", () => {
		isDraggingHueWheel = false;
	});

	hueWheel.addEventListener("lostpointercapture", () => {
		isDraggingHueWheel = false;
	});

	cancelButton.addEventListener("click", () => {
		clearSceneEditor();
	});

	saveButton.addEventListener("click", async () => {
		try {
			setBusyState(true);
			await scenePreviewQueue.flushNow();
			const response = await fetch(`/api/scenes/${scene.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					name: editingSceneDraft.name,
					description: editingSceneDraft.description,
					...buildEditingSceneValues()
				})
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to save scene.");
			}

			if ((currentStatus?.lastAction?.sceneId === payload.previousSceneId) || hasLiveScenePreview) {
				payload.status.lastAction = {
					...(payload.status.lastAction ?? {}),
					sceneId: payload.scene.id,
					sceneName: payload.scene.name,
					appliedAt: new Date().toISOString()
				};
			}

			setSceneFeedback(payload.scene.id, "Updated");
			hasLiveScenePreview = false;
			editingSceneId = null;
			editingSceneDraft = null;
			renderStatus(payload.status);
		} catch (error) {
			statusText.textContent = error.message;
		} finally {
			setBusyState(false);
		}
	});

	updateEditorDisplay();
}

function createSceneCard(scene) {
	const card = document.createElement("article");
	card.className = "scene-card";
	card.dataset.sceneId = scene.id;

	const header = document.createElement("div");
	header.className = "scene-card-header";
	const title = document.createElement("h2");
	const editButton = document.createElement("button");
	editButton.type = "button";
	editButton.className = "scene-edit-button";
	editButton.dataset.sceneEditorId = scene.id;
	const editIcon = document.createElement("img");
	editIcon.className = "scene-edit-icon";
	editIcon.src = "/assets/iconoir/regular/edit-pencil.svg";
	editIcon.alt = "";
	editIcon.setAttribute("aria-hidden", "true");
	editButton.append(editIcon);
	header.append(title, editButton);

	const description = document.createElement("p");
	const settings = document.createElement("p");
	settings.className = "scene-settings-meta";
	const button = document.createElement("button");
	button.type = "button";
	button.className = "scene-apply-button";
	const buttonIcon = document.createElement("img");
	buttonIcon.className = "scene-trigger-icon";
	buttonIcon.src = "/assets/iconoir/solid/send.svg";
	buttonIcon.alt = "";
	buttonIcon.setAttribute("aria-hidden", "true");
	const buttonLabel = document.createElement("span");
	buttonLabel.className = "scene-apply-label";
	button.append(buttonIcon, buttonLabel);

	card.append(header, description, settings, button);
	return card;
}

function getSceneCardState(scene) {
	const isActive = currentStatus?.lastAction?.sceneId === scene.id;
	const isShowingFeedback = sceneFeedbackId === scene.id;
	const isEditing = editingSceneId === scene.id;
	const actionableTargetCount = currentStatus?.lights?.filter((light) => light.targeted && light.status === "on").length ?? 0;
	const isUnavailable = !editingSceneId && actionableTargetCount === 0;
	const isDisabled = editingSceneId ? !isEditing : isUnavailable;
	const focusState = editingSceneId
		? (isEditing ? "editing" : "muted")
		: (isUnavailable ? "disabled" : "idle");

	return {
		isActive,
		isShowingFeedback,
		isEditing,
		focusState,
		isDisabled
	};
}

function updateSceneCard(card, scene) {
	const title = card.querySelector("h2");
	const description = card.querySelector("p");
	const settings = card.querySelector(".scene-settings-meta");
	const button = card.querySelector(".scene-apply-button");
	const editButton = card.querySelector(".scene-edit-button");
	const buttonIcon = card.querySelector(".scene-trigger-icon");
	const buttonLabel = card.querySelector(".scene-apply-label");
	const {
		isActive,
		isShowingFeedback,
		isEditing,
		focusState,
		isDisabled
	} = getSceneCardState(scene);

	card.dataset.sceneId = scene.id;
	card.dataset.active = String(isActive);
	card.dataset.focus = focusState;
	card.dataset.disabled = String(isDisabled);
	title.textContent = scene.name;
	description.textContent = sceneDescription(scene);
	settings.textContent = sceneSettingsLabel(scene);
	editButton.disabled = isSubmitting || isDisabled;
	editButton.setAttribute("aria-label", `Edit ${scene.name}`);
	editButton.onclick = () => {
		if (editingSceneId === scene.id) {
			clearSceneEditor();
			return;
		}

		setSceneEditor(scene);
	};
	button.onclick = () => applyScene(scene.id);
	const buttonAppearance = getSceneButtonAppearance(scene);
	const buttonRgb = buttonAppearance.rgb;
	const buttonRingColor = "rgba(255, 255, 255, 0.58)";
	const buttonForeground = getSceneButtonForeground(buttonRgb);
	button.style.background = buttonAppearance.cssColor;
	button.style.setProperty("--scene-button-bg", buttonAppearance.cssColor);
	button.style.setProperty("--scene-button-fg", buttonForeground);
	button.style.setProperty("--scene-button-ring", buttonRingColor);
	button.style.setProperty("--scene-button-border", getSceneButtonBorder(scene, buttonRgb));
	button.style.setProperty("--scene-icon-filter", getSceneIconFilter(buttonRgb));
	if (isShowingFeedback) {
		buttonLabel.textContent = sceneFeedbackLabel ?? "Applied";
		buttonLabel.hidden = false;
		buttonIcon.hidden = true;
	} else {
		buttonLabel.hidden = true;
		buttonIcon.hidden = false;
	}
	button.dataset.sceneTriggerId = scene.id;
	button.dataset.applied = String(isShowingFeedback);
	button.setAttribute("aria-label", isActive ? `${scene.name} applied` : `Trigger ${scene.name}`);
	button.style.setProperty("--scene-transition-ms", `${currentStatus?.transitionDurationMs ?? 1000}ms`);
	button.disabled = isSubmitting || isDisabled;
}

function renderScenes(scenes) {
	const existingCards = [...sceneGrid.querySelectorAll(".scene-card")];
	const nextCards = scenes.map((scene, index) => {
		const card = existingCards[index] ?? createSceneCard(scene);
		updateSceneCard(card, scene);
		return card;
	});

	sceneGrid.replaceChildren(...nextCards);
}

function renderStatus(payload) {
	currentStatus = payload;
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
	warningText.textContent = payload.warning ?? "";
	if (!isAdjustingTransitionDuration || isSubmitting) {
		setTransitionDurationDisplay(payload.transitionDurationMs);
	}
	if (!isAdjustingLiveBrightness && !liveBrightnessQueue.isRequestInFlight()) {
		setBrightnessDisplay(payload.liveBrightnessPercent);
	}
	brightnessSlider.disabled = isSubmitting || payload.lights.filter((light) => light.targeted).length === 0;

	if (!isSubmitting && !activeActivity) {
		setActivity("");
	}
	renderScenes(payload.scenes);
	renderSceneEditor(payload.scenes);
	renderLights(payload.lights);
}

async function loadStatus() {
	const response = await fetch("/api/status");
	if (!response.ok) {
		throw new Error("Failed to load controller status.");
	}
	const payload = await response.json();
	renderStatus(payload);
}

async function waitForServerReady(timeoutMs = 30000) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(`/api/status?ts=${Date.now()}`, { cache: "no-store" });
			if (response.ok) {
				return response.json();
			}
		} catch {
			// Server is still restarting.
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
	}

	throw new Error("Server restart timed out.");
}

async function applyScene(sceneId) {
	try {
		setBusyState(true);
		const response = await fetch(`/api/scenes/${sceneId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			}
		});
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error ?? "Failed to apply scene.");
		}
		setSceneFeedback(sceneId, "Applied");
		renderStatus(payload.status);
	} catch (error) {
		statusText.textContent = error.message;
	} finally {
		setBusyState(false);
	}
}

async function saveTargets(enabledTargetIds, disabledTargetIds) {
	const response = await fetch("/api/targets", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ enabledTargetIds, disabledTargetIds })
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Failed to save target bulbs.");
	}
	renderStatus(payload);
}

async function saveAddressGroupState(addressGroup, enabled) {
	const response = await fetch("/api/address-groups", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ addressGroup, enabled })
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Failed to update subnet devices.");
	}
	renderStatus(payload);
}

async function saveTransitionDuration(transitionDurationMs) {
	const response = await fetch("/api/transition-duration", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ transitionDurationMs })
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Failed to save transition duration.");
	}
	renderStatus(payload);
}

async function saveLiveBrightness(brightnessPercent) {
	const response = await fetch("/api/brightness", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ brightnessPercent })
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Failed to update live brightness.");
	}

	if (currentStatus) {
		currentStatus.liveBrightnessPercent = payload.result?.brightnessPercent ?? brightnessPercent;
	}
}

async function saveScenePreview(sceneValues) {
	const response = await fetch("/api/scene-preview", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(sceneValues)
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Failed to preview scene.");
	}

	return payload.result;
}

const liveBrightnessQueue = createLiveCommandQueue({
	dispatchIntervalMs: LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS,
	refreshDelayMs: LIVE_BRIGHTNESS_REFRESH_DELAY_MS,
	save: saveLiveBrightness,
	onError: (error) => {
		statusText.textContent = error.message;
		if (currentStatus) {
			setBrightnessDisplay(currentStatus.liveBrightnessPercent);
		}
	},
	refresh: () => {
		if (!isSubmitting && !isAdjustingLiveBrightness && !liveBrightnessQueue.isRequestInFlight()) {
			loadStatus().catch((error) => {
				statusText.textContent = error.message;
			});
		}
	}
});

const scenePreviewQueue = createLiveCommandQueue({
	dispatchIntervalMs: LIVE_SCENE_PREVIEW_DISPATCH_INTERVAL_MS,
	refreshDelayMs: LIVE_SCENE_PREVIEW_REFRESH_DELAY_MS,
	save: saveScenePreview,
	onSuccess: () => {
		hasLiveScenePreview = true;
	},
	onError: (error) => {
		statusText.textContent = error.message;
	},
	refresh: () => {
		if (!isSubmitting && !editingSceneId && !scenePreviewQueue.isRequestInFlight()) {
			loadStatus().catch((error) => {
				statusText.textContent = error.message;
			});
		}
	}
});

async function toggleTarget(lightId) {
	if (!currentStatus?.manualTargetingEnabled || isSavingTargetState) {
		return;
	}

	const light = currentStatus.lights?.find((entry) => entry.id === lightId);
	if (!light) {
		return;
	}

	const enabledTargetIds = new Set(currentStatus.enabledTargetIds ?? []);
	const disabledTargetIds = new Set(currentStatus.disabledTargetIds ?? []);

	if (light.enabled) {
		enabledTargetIds.delete(lightId);
		disabledTargetIds.add(lightId);
	} else {
		enabledTargetIds.add(lightId);
		disabledTargetIds.delete(lightId);
	}

	try {
		setTargetSaveState(true);
		applyLocalTargetState([...enabledTargetIds], [...disabledTargetIds]);
		await saveTargets([...enabledTargetIds], [...disabledTargetIds]);
	} catch (error) {
		statusText.textContent = error.message;
		if (currentStatus) {
			loadStatus().catch((loadError) => {
				statusText.textContent = loadError.message;
			});
		}
	} finally {
		setTargetSaveState(false);
	}
}

async function toggleAddressGroup(addressGroup, enabled) {
	if (!currentStatus?.manualTargetingEnabled || isSavingTargetState) {
		return;
	}

	const enabledTargetIds = new Set(currentStatus.enabledTargetIds ?? []);
	const disabledTargetIds = new Set(currentStatus.disabledTargetIds ?? []);
	const groupLights = (currentStatus.lights ?? []).filter((light) => light.addressGroup === addressGroup);

	for (const light of groupLights) {
		if (enabled) {
			enabledTargetIds.add(light.id);
			disabledTargetIds.delete(light.id);
		} else {
			enabledTargetIds.delete(light.id);
			disabledTargetIds.add(light.id);
		}
	}

	try {
		setTargetSaveState(true);
		applyLocalTargetState([...enabledTargetIds], [...disabledTargetIds]);
		await saveAddressGroupState(addressGroup, enabled);
	} catch (error) {
		statusText.textContent = error.message;
		if (currentStatus) {
			loadStatus().catch((loadError) => {
				statusText.textContent = loadError.message;
			});
		}
	} finally {
		setTargetSaveState(false);
	}
}

loadStatus().catch((error) => {
	statusText.textContent = error.message;
});

discoverButton.addEventListener("click", async () => {
	try {
		setActivity("Rescanning LAN and refreshing discovered devices...");
		setBusyState(true);
		const response = await fetch("/api/discover", { method: "POST" });
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error ?? "Failed to refresh discovery.");
		}
		renderStatus(payload);
		setActivity(
			`Rescan complete. ${payload.onlineCount} bulb(s) online across ${payload.addressGroups.length} subnet group(s).`, { autoClearMs: 5000 }
		);
	} catch (error) {
		statusText.textContent = error.message;
		setActivity("");
	} finally {
		setBusyState(false);
	}
});

restartButton.addEventListener("click", async () => {
	try {
		setActivity("Restarting server and reloading controller state...");
		setBusyState(true);

		const response = await fetch("/api/restart", { method: "POST" });
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error ?? "Failed to restart server.");
		}

		const status = await waitForServerReady();
		renderStatus(status);
		setActivity("Server restart complete. Fresh state loaded.", { autoClearMs: 5000 });
	} catch (error) {
		statusText.textContent = error.message;
		setActivity("");
	} finally {
		setBusyState(false);
	}
});

transitionDurationSlider.addEventListener("input", (event) => {
	isAdjustingTransitionDuration = true;
	setTransitionDurationDisplay(Number(event.target.value));
});

transitionDurationSlider.addEventListener("change", async (event) => {
	const nextDurationMs = Number(event.target.value);

	try {
		setBusyState(true);
		await saveTransitionDuration(nextDurationMs);
	} catch (error) {
		statusText.textContent = error.message;
		setTransitionDurationDisplay(currentStatus?.transitionDurationMs ?? 1000);
	} finally {
		isAdjustingTransitionDuration = false;
		setBusyState(false);
	}
});

transitionDurationSlider.addEventListener("blur", () => {
	if (!isSubmitting) {
		isAdjustingTransitionDuration = false;
		setTransitionDurationDisplay(currentStatus?.transitionDurationMs ?? 1000);
	}
});

brightnessSlider.addEventListener("input", (event) => {
	const nextBrightnessPercent = Number(event.target.value);
	isAdjustingLiveBrightness = true;
	setBrightnessDisplay(nextBrightnessPercent);
	liveBrightnessQueue.queue(nextBrightnessPercent);
});

brightnessSlider.addEventListener("change", (event) => {
	isAdjustingLiveBrightness = false;
	liveBrightnessQueue.queue(Number(event.target.value));
	void liveBrightnessQueue.flushNow();
});

brightnessSlider.addEventListener("blur", () => {
	isAdjustingLiveBrightness = false;
	if (!liveBrightnessQueue.isRequestInFlight() && currentStatus) {
		setBrightnessDisplay(currentStatus.liveBrightnessPercent);
		liveBrightnessQueue.scheduleRefresh();
	}
});

setInterval(() => {
	if (!isSubmitting && !isAdjustingLiveBrightness && !liveBrightnessQueue.isRequestInFlight() && !editingSceneId) {
		loadStatus().catch((error) => {
			statusText.textContent = error.message;
		});
	}
}, STATUS_POLL_INTERVAL_MS);
