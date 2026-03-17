const statusText = document.querySelector("#status-text");
const warningText = document.querySelector("#warning-text");
const onlineCount = document.querySelector("#online-count");
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

let activeSceneId = null;
let isSubmitting = false;
let currentStatus = null;
let activeActivity = "";
let activityClearTimer = null;
let recentlyUpdatedSceneId = null;
let isAdjustingTransitionDuration = false;
let isAdjustingLiveBrightness = false;
let liveBrightnessRequestInFlight = false;
let pendingLiveBrightnessPercent = null;
let liveBrightnessDispatchTimer = null;
let liveBrightnessRefreshTimer = null;
let editingSceneId = null;
let editingSceneDraft = null;

const LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS = 100;
const LIVE_BRIGHTNESS_REFRESH_DELAY_MS = 300;

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

function compressSwatchBrightness(brightness) {
	if (brightness <= 0) {
		return 0;
	}

	return 25 + (brightness * 0.75);
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

function getSceneButtonRgb(scene) {
	if (scene.power === "off" || Number(scene.brightness ?? 0) <= 0) {
		return { red: 0, green: 0, blue: 0 };
	}

	if ((scene.saturation ?? 0) <= 0.08) {
		return scaleKelvinSwatchBrightness(
			kelvinToRgb(scene.kelvin ?? 3500),
			Math.max(52, Math.round((scene.brightness ?? 0) * 100))
		);
	}

	return hsbToRgb(
		scene.hue ?? 0,
		Math.max(22, Math.round((scene.saturation ?? 0) * 100)),
		Math.max(52, Math.round((scene.brightness ?? 0) * 100))
	);
}

function getStateSwatchColor(currentState) {
	if (!currentState || currentState.power !== "on" || currentState.brightness <= 0) {
		return "transparent";
	}

	if (currentState.saturation <= 8) {
		return rgbToCss(scaleKelvinSwatchBrightness(kelvinToRgb(currentState.kelvin), currentState.brightness));
	}

	return rgbToCss(
		hsbToRgb(
			currentState.hue,
			currentState.saturation,
			compressSwatchBrightness(currentState.brightness)
		)
	);
}

function getStateLabel(currentState) {
	if (!currentState) {
		return "State pending";
	}

	if (currentState.power !== "on") {
		return "Off";
	}

	return `${Math.round(currentState.brightness)}% · ${Math.round(currentState.hue)}° · ${Math.round(currentState.kelvin)}K`;
}

function isLightEnabled(light) {
	return light.enabled !== false;
}

function renderLightCard(light) {
	const card = document.createElement("article");
	card.className = "light-card";
	const enabled = isLightEnabled(light);
	card.dataset.enabled = String(enabled);
	const header = document.createElement("div");
	header.className = "light-card-header";
	const swatch = document.createElement("span");
	swatch.className = "light-swatch";
	if (!light.currentState || light.currentState.power !== "on" || light.currentState.brightness <= 0) {
		swatch.dataset.power = "off";
		swatch.setAttribute("aria-label", "Bulb is off");
	} else {
		swatch.dataset.power = "on";
		swatch.style.background = getStateSwatchColor(light.currentState);
		swatch.setAttribute("aria-label", "Bulb is on");
	}
	const title = document.createElement("h3");
	title.textContent = light.label;
	header.append(swatch, title);
	const address = document.createElement("p");
	address.className = "light-meta light-identifier-meta";
	address.textContent = light.address;
	const identifier = document.createElement("p");
	identifier.className = "light-meta light-identifier-meta";
	identifier.textContent = `ID: ${light.id}`;
	const stateLabel = document.createElement("p");
	stateLabel.className = "light-meta light-state-meta";
	stateLabel.textContent = getStateLabel(light.currentState);

	const pillRow = document.createElement("div");
	pillRow.className = "pill-row";

	const onlinePill = document.createElement("span");
	onlinePill.className = `pill ${light.status === "on" ? "online" : "offline"}`;
	onlinePill.textContent = light.status === "on" ? "Online" : "Offline";

	const targetingPillTag = currentStatus?.manualTargetingEnabled ? "button" : "span";
	const targetingPill = document.createElement(targetingPillTag);
	targetingPill.className = `pill pill-toggle ${enabled ? "enabled" : "disabled"}`;
	targetingPill.textContent = enabled ? "Enabled" : "Disabled";

	if (currentStatus?.manualTargetingEnabled) {
		targetingPill.type = "button";
		targetingPill.disabled = isSubmitting;
		targetingPill.setAttribute(
			"aria-label",
			enabled ? `Disable ${light.label}` : `Enable ${light.label}`
		);
		targetingPill.addEventListener("click", () => toggleTarget(light.id));
	}

	pillRow.append(targetingPill);
	pillRow.append(onlinePill);

	card.append(header, stateLabel, address, identifier, pillRow);

	return card;
}

function renderLights(lights) {
	const groupedLights = lights.reduce((groups, light) => {
		if (!groups.has(light.addressGroup)) {
			groups.set(light.addressGroup, []);
		}
		groups.get(light.addressGroup).push(light);
		return groups;
	}, new Map());

	const groupElements = (currentStatus?.addressGroups ?? []).map((group) => {
		const wrapper = document.createElement("section");
		wrapper.className = "device-group";
		wrapper.dataset.enabled = String(group.enabledCount > 0);

		const header = document.createElement("div");
		header.className = "device-group-header";

		const headerText = document.createElement("div");
		headerText.className = "device-group-summary";
		const title = document.createElement("h3");
		title.textContent = group.label;
		const stats = document.createElement("div");
		stats.className = "device-group-stats";

		const onlineStat = document.createElement("span");
		onlineStat.className = "device-group-stat";
		onlineStat.textContent = `${group.onlineCount}/${group.count} online`;

		const enabledStat = document.createElement("span");
		enabledStat.className = "device-group-stat";
		enabledStat.textContent = `${group.enabledCount} enabled`;

		stats.append(onlineStat, enabledStat);
		headerText.append(title, stats);

		const actions = document.createElement("div");
		actions.className = "device-group-actions";

		const enableButton = document.createElement("button");
		enableButton.className = "device-group-toggle";
		enableButton.dataset.addressGroup = group.key;
		enableButton.textContent = "Enable All";
		enableButton.disabled = isSubmitting || !currentStatus?.manualTargetingEnabled;
		enableButton.addEventListener("click", () => toggleAddressGroup(group.key, true));

		const disableButton = document.createElement("button");
		disableButton.className = "device-group-toggle";
		disableButton.dataset.addressGroup = group.key;
		disableButton.textContent = "Disable All";
		disableButton.disabled = isSubmitting || !currentStatus?.manualTargetingEnabled;
		disableButton.addEventListener("click", () => toggleAddressGroup(group.key, false));

		actions.append(enableButton, disableButton);

		header.append(headerText);
		header.append(actions);
		wrapper.append(header);

		const grid = document.createElement("div");
		grid.className = "device-group-grid";
		grid.append(
			...(groupedLights.get(group.key) ?? [])
			.slice()
			.sort((left, right) => left.label.localeCompare(right.label))
			.map((light) => renderLightCard(light))
		);

		wrapper.append(grid);
		return wrapper;
	});

	lightGrid.replaceChildren(...groupElements);
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
	return {
		name: scene.name,
		description: scene.description ?? "",
		hue: Math.round(scene.hue ?? 0),
		saturation: Math.round((scene.saturation ?? 0) * 100),
		brightness: Math.round((scene.brightness ?? 0) * 100),
		kelvin: Math.round(scene.kelvin ?? 3500),
		colorMode: (scene.saturation ?? 0) <= 0.08 ? "white" : "color"
	};
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
	renderScenes(currentStatus?.scenes ?? []);
	renderSceneEditor(currentStatus?.scenes ?? []);
}

function clearSceneEditor() {
	editingSceneId = null;
	editingSceneDraft = null;
	renderScenes(currentStatus?.scenes ?? []);
	renderSceneEditor(currentStatus?.scenes ?? []);
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
	const editorTitle = document.createElement("h3");
	editorTitle.className = "scene-editor-title";
	editorTitle.textContent = `Editing ${scene.name}`;
	const editorSubtitle = document.createElement("p");
	editorSubtitle.className = "scene-editor-subtitle";
	editorSubtitle.textContent = "Update the scene details and color settings, then save to rewrite scenes.json.";
	editorHeader.append(editorTitle, editorSubtitle);

	const fieldGrid = document.createElement("div");
	fieldGrid.className = "scene-editor-grid";

	const modeField = document.createElement("div");
	modeField.className = "scene-editor-field scene-editor-mode-field";
	const modeLabel = document.createElement("span");
	modeLabel.textContent = "Light Type";
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
	modeToggle.append(colorModeButton, whiteModeButton);
	modeField.append(modeLabel, modeToggle);

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
	const hueLabel = document.createElement("span");
	hueLabel.textContent = "Color";
	const hueWheel = document.createElement("div");
	hueWheel.className = "scene-hue-wheel";
	const hueIndicator = document.createElement("div");
	hueIndicator.className = "scene-hue-indicator";
	hueWheel.append(hueIndicator);
	const hueMeta = document.createElement("div");
	hueMeta.className = "scene-editor-meta";
	const huePreview = document.createElement("div");
	huePreview.className = "scene-editor-preview";
	const hueValue = document.createElement("div");
	hueValue.className = "scene-editor-value";
	hueMeta.append(huePreview, hueValue);
	hueField.append(hueLabel, hueWheel, hueMeta);

	const kelvinField = document.createElement("label");
	kelvinField.className = "scene-editor-field scene-editor-color-field";
	const kelvinLabel = document.createElement("span");
	kelvinLabel.textContent = "White Temperature";
	const kelvinSlider = document.createElement("input");
	kelvinSlider.className = "transition-slider scene-editor-slider scene-kelvin-slider";
	kelvinSlider.type = "range";
	kelvinSlider.min = "1500";
	kelvinSlider.max = "9000";
	kelvinSlider.step = "100";
	const kelvinMeta = document.createElement("div");
	kelvinMeta.className = "scene-editor-meta";
	const kelvinPreview = document.createElement("div");
	kelvinPreview.className = "scene-editor-preview";
	const kelvinValue = document.createElement("div");
	kelvinValue.className = "scene-editor-value";
	kelvinMeta.append(kelvinPreview, kelvinValue);
	kelvinField.append(kelvinLabel, kelvinSlider, kelvinMeta);

	const brightnessField = document.createElement("label");
	brightnessField.className = "scene-editor-field";
	const brightnessLabel = document.createElement("span");
	brightnessLabel.textContent = "Brightness";
	const brightnessSlider = document.createElement("input");
	brightnessSlider.className = "transition-slider scene-editor-slider";
	brightnessSlider.type = "range";
	brightnessSlider.min = "0";
	brightnessSlider.max = "100";
	brightnessSlider.step = "1";
	const brightnessValue = document.createElement("div");
	brightnessValue.className = "scene-editor-value";
	brightnessField.append(brightnessLabel, brightnessSlider, brightnessValue);

	fieldGrid.append(modeField, hueField, kelvinField, nameField, descriptionField, brightnessField);

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

	editor.append(editorHeader, fieldGrid, actions);
	sceneEditorContainer.append(editor);
	let isDraggingHueWheel = false;

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
		hueField.hidden = editingSceneDraft.colorMode !== "color";
		kelvinField.hidden = editingSceneDraft.colorMode !== "white";
		kelvinSlider.value = String(editingSceneDraft.kelvin);
		updateSliderProgress(kelvinSlider, kelvinSlider.value);
		hueValue.textContent = `${Math.round(editingSceneDraft.hue)}° · ${Math.round(editingSceneDraft.saturation)}% sat`;
		const indicatorPosition = getHueWheelPosition(editingSceneDraft.hue, editingSceneDraft.saturation);
		hueIndicator.style.left = `${indicatorPosition.x}%`;
		hueIndicator.style.top = `${indicatorPosition.y}%`;
		huePreview.style.background = rgbToCss(hsbToRgb(
			editingSceneDraft.hue,
			editingSceneDraft.saturation,
			Math.max(35, editingSceneDraft.brightness)
		));
		kelvinValue.textContent = formatKelvinLabel(editingSceneDraft.kelvin);
		kelvinPreview.style.background = rgbToCss(scaleKelvinSwatchBrightness(
			kelvinToRgb(editingSceneDraft.kelvin),
			Math.max(35, editingSceneDraft.brightness)
		));
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
			colorMode: "color"
		};
		updateEditorDisplay();
	});

	whiteModeButton.addEventListener("click", () => {
		editingSceneDraft = {
			...editingSceneDraft,
			colorMode: "white"
		};
		updateEditorDisplay();
	});

	brightnessSlider.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			brightness: Number(event.target.value)
		};
		updateEditorDisplay();
	});

	kelvinSlider.addEventListener("input", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			kelvin: Number(event.target.value)
		};
		updateEditorDisplay();
	});

	kelvinSlider.addEventListener("change", (event) => {
		editingSceneDraft = {
			...editingSceneDraft,
			kelvin: Number(event.target.value)
		};
		updateEditorDisplay();
	});

	hueWheel.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		isDraggingHueWheel = true;
		hueWheel.setPointerCapture(event.pointerId);
		updateSceneDraftFromWheel(event, hueWheel, updateEditorDisplay);
	});

	hueWheel.addEventListener("pointermove", (event) => {
		if (!isDraggingHueWheel) {
			return;
		}

		updateSceneDraftFromWheel(event, hueWheel, updateEditorDisplay);
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
			const response = await fetch(`/api/scenes/${scene.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					name: editingSceneDraft.name,
					description: editingSceneDraft.description,
					hue: editingSceneDraft.hue,
					saturation: editingSceneDraft.colorMode === "white" ? 0 : editingSceneDraft.saturation / 100,
					brightness: editingSceneDraft.brightness / 100,
					kelvin: Number(kelvinSlider.value)
				})
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? "Failed to save scene.");
			}

			if (activeSceneId === payload.previousSceneId) {
				activeSceneId = payload.scene.id;
			}

			recentlyUpdatedSceneId = payload.scene.id;
			editingSceneId = null;
			editingSceneDraft = null;
			renderStatus(payload.status);
			if (payload.applyError) {
				statusText.textContent = `Scene saved, but applying it failed: ${payload.applyError}`;
			}
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

function updateSceneCard(card, scene) {
	const title = card.querySelector("h2");
	const description = card.querySelector("p");
	const settings = card.querySelector(".scene-settings-meta");
	const button = card.querySelector(".scene-apply-button");
	const editButton = card.querySelector(".scene-edit-button");
	const buttonIcon = card.querySelector(".scene-trigger-icon");
	const buttonLabel = card.querySelector(".scene-apply-label");
	const isApplied = activeSceneId === scene.id;
	const isEditing = editingSceneId === scene.id;

	card.dataset.sceneId = scene.id;
	card.dataset.active = String(isApplied);
	card.dataset.editing = String(isEditing);
	title.textContent = scene.name;
	description.textContent = sceneDescription(scene);
	settings.textContent = sceneSettingsLabel(scene);
	editButton.disabled = isSubmitting;
	editButton.setAttribute("aria-label", `Edit ${scene.name}`);
	editButton.onclick = () => {
		if (editingSceneId === scene.id) {
			clearSceneEditor();
			return;
		}

		setSceneEditor(scene);
	};
	button.onclick = () => applyScene(scene.id);
	const buttonRgb = getSceneButtonRgb(scene);
	const buttonRingColor = "rgba(255, 255, 255, 0.58)";
	const buttonForeground = getSceneButtonForeground(buttonRgb);
	button.style.backgroundColor = rgbToCss(buttonRgb);
	button.style.setProperty("--scene-button-bg", rgbToCss(buttonRgb));
	button.style.setProperty("--scene-button-fg", buttonForeground);
	button.style.setProperty("--scene-button-ring", buttonRingColor);
	button.style.setProperty("--scene-button-border", getSceneButtonBorder(scene, buttonRgb));
	button.style.setProperty("--scene-icon-filter", getSceneIconFilter(buttonRgb));
	if (isApplied) {
		buttonLabel.textContent = recentlyUpdatedSceneId === scene.id ? "Updated" : "Applied";
		buttonLabel.hidden = false;
		buttonIcon.hidden = true;
	} else {
		buttonLabel.hidden = true;
		buttonIcon.hidden = false;
	}
	button.dataset.sceneTriggerId = scene.id;
	button.dataset.applied = String(isApplied);
	button.setAttribute("aria-label", isApplied ? `${scene.name} applied` : `Trigger ${scene.name}`);
	button.style.setProperty("--scene-transition-ms", `${currentStatus?.transitionDurationMs ?? 1000}ms`);
	button.disabled = isSubmitting;
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
	activeSceneId = payload.lastAction?.sceneId ?? activeSceneId;
	const statusParts = [];
	statusParts.push(`${payload.onlineCount} of ${payload.discoveredCount} discovered bulbs online.`);
	if (payload.lastAction) {
		statusParts.push(
			`Last scene: ${payload.lastAction.sceneName} at ${new Date(payload.lastAction.appliedAt).toLocaleTimeString()}.`
		);
	}
	statusText.textContent = statusParts.join(" ");

	onlineCount.textContent = String(payload.onlineCount);
	targetedCount.textContent = String(payload.targetedCount);
	warningText.hidden = !payload.warning;
	warningText.textContent = payload.warning ?? "";
	if (!isAdjustingTransitionDuration || isSubmitting) {
		setTransitionDurationDisplay(payload.transitionDurationMs);
	}
	if (!isAdjustingLiveBrightness && !liveBrightnessRequestInFlight) {
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
		recentlyUpdatedSceneId = null;
		activeSceneId = sceneId;
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

function scheduleLiveBrightnessRefresh() {
	if (liveBrightnessRefreshTimer) {
		clearTimeout(liveBrightnessRefreshTimer);
	}

	liveBrightnessRefreshTimer = setTimeout(() => {
		liveBrightnessRefreshTimer = null;
		if (!isSubmitting && !isAdjustingLiveBrightness && !liveBrightnessRequestInFlight) {
			loadStatus().catch((error) => {
				statusText.textContent = error.message;
			});
		}
	}, LIVE_BRIGHTNESS_REFRESH_DELAY_MS);
}

async function flushLiveBrightnessQueue() {
	if (liveBrightnessRequestInFlight || pendingLiveBrightnessPercent == null) {
		return;
	}

	const nextBrightnessPercent = pendingLiveBrightnessPercent;
	pendingLiveBrightnessPercent = null;
	liveBrightnessRequestInFlight = true;

	try {
		await saveLiveBrightness(nextBrightnessPercent);
	} catch (error) {
		statusText.textContent = error.message;
		if (currentStatus) {
			setBrightnessDisplay(currentStatus.liveBrightnessPercent);
		}
	} finally {
		liveBrightnessRequestInFlight = false;
		if (pendingLiveBrightnessPercent != null) {
			void flushLiveBrightnessQueue();
		} else if (!isAdjustingLiveBrightness && currentStatus) {
			setBrightnessDisplay(currentStatus.liveBrightnessPercent);
			scheduleLiveBrightnessRefresh();
		}
	}
}

function queueLiveBrightnessUpdate(brightnessPercent) {
	pendingLiveBrightnessPercent = brightnessPercent;
	if (liveBrightnessDispatchTimer) {
		return;
	}

	liveBrightnessDispatchTimer = setTimeout(() => {
		liveBrightnessDispatchTimer = null;
		void flushLiveBrightnessQueue();
	}, LIVE_BRIGHTNESS_DISPATCH_INTERVAL_MS);
}

async function toggleTarget(lightId) {
	if (!currentStatus?.manualTargetingEnabled) {
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
		setBusyState(true);
		await saveTargets([...enabledTargetIds], [...disabledTargetIds]);
	} catch (error) {
		statusText.textContent = error.message;
	} finally {
		setBusyState(false);
	}
}

async function toggleAddressGroup(addressGroup, enabled) {
	if (!currentStatus?.manualTargetingEnabled) {
		return;
	}

	try {
		setBusyState(true);
		await saveAddressGroupState(addressGroup, enabled);
	} catch (error) {
		statusText.textContent = error.message;
	} finally {
		setBusyState(false);
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
	queueLiveBrightnessUpdate(nextBrightnessPercent);
});

brightnessSlider.addEventListener("change", (event) => {
	isAdjustingLiveBrightness = false;
	if (liveBrightnessDispatchTimer) {
		clearTimeout(liveBrightnessDispatchTimer);
		liveBrightnessDispatchTimer = null;
	}
	queueLiveBrightnessUpdate(Number(event.target.value));
	void flushLiveBrightnessQueue();
});

brightnessSlider.addEventListener("blur", () => {
	isAdjustingLiveBrightness = false;
	if (!liveBrightnessRequestInFlight && currentStatus) {
		setBrightnessDisplay(currentStatus.liveBrightnessPercent);
		scheduleLiveBrightnessRefresh();
	}
});

setInterval(() => {
	if (!isSubmitting && !isAdjustingLiveBrightness && !liveBrightnessRequestInFlight && !editingSceneId) {
		loadStatus().catch((error) => {
			statusText.textContent = error.message;
		});
	}
}, 2000);
