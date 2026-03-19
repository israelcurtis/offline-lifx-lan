import {
	MIN_SCENE_BRIGHTNESS_PERCENT,
	buildEditingSceneValues,
	formatKelvinLabel,
	formatPercentLabel,
	getDefaultSceneKelvin,
	getHueWheelPosition,
	getPerceptualHueColor,
	getPerceptualKelvinColor,
	getEditableSceneBrightnessPercent,
	makeSceneDraft,
	updateSceneDraftFromWheel
} from "../lib/light-model.js";
import { replaceNodeChildren, updateSliderProgress } from "../lib/dom-utils.js";

function queueEditorScenePreview(state, queues) {
	if (
		!state.editingSceneDraft
		|| !state.currentStatus
		|| !state.currentStatus.lights
		|| !state.currentStatus.lights.some((light) => light.enabled !== false && light.status === "on")
	) {
		return;
	}

	const nextPreview = buildEditingSceneValues(state.editingSceneDraft, getDefaultSceneKelvin(state.currentStatus));
	if (nextPreview) {
		queues.scenePreviewQueue.queue(nextPreview);
	}
}

export function renderSceneEditor({ sceneEditorSection, sceneEditorContainer, state, queues, actions }) {
	const scenes = state.currentStatus && state.currentStatus.scenes ? state.currentStatus.scenes : [];
	const scene = scenes.find((entry) => entry.id === state.editingSceneId);
	replaceNodeChildren(sceneEditorContainer, []);

	if (!scene || !state.editingSceneDraft) {
		sceneEditorSection.hidden = true;
		return;
	}

	sceneEditorSection.hidden = false;

	if (state.editingSceneId !== scene.id || !state.editingSceneDraft) {
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
	nameInput.value = state.editingSceneDraft.name;
	nameField.append(nameLabel, nameInput);

	const descriptionField = document.createElement("label");
	descriptionField.className = "scene-editor-field";
	const descriptionLabel = document.createElement("span");
	descriptionLabel.textContent = "Description";
	const descriptionInput = document.createElement("input");
	descriptionInput.className = "scene-editor-input";
	descriptionInput.type = "text";
	descriptionInput.value = state.editingSceneDraft.description;
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

	const actionsRow = document.createElement("div");
	actionsRow.className = "scene-editor-actions";
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
	actionsRow.append(cancelButton, saveButton);

	editorHeader.append(editorHeaderCopy, actionsRow);
	editor.append(editorHeader, fieldGrid);
	sceneEditorContainer.append(editor);
	let isDraggingHueWheel = false;
	let activeTouchId = null;
	let fallbackListenersAttached = false;

	function updateHueFromPointerEvent(event) {
		actions.onUpdateEditingSceneDraft(updateSceneDraftFromWheel(state.editingSceneDraft, event, hueWheel));
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	}

	function handleFallbackMouseMove(event) {
		if (!isDraggingHueWheel) {
			return;
		}

		updateHueFromPointerEvent(event);
	}

	function handleFallbackTouchMove(event) {
		if (!isDraggingHueWheel) {
			return;
		}

		// TouchList iteration is not consistently iterable on older Safari builds.
		for (let index = 0; index < event.touches.length; index += 1) {
			const touch = event.touches[index];
			if (touch.identifier === activeTouchId) {
				event.preventDefault();
				updateHueFromPointerEvent(touch);
				return;
			}
		}
	}

	function attachFallbackDragListeners() {
		if (fallbackListenersAttached) {
			return;
		}

		fallbackListenersAttached = true;
		window.addEventListener("mousemove", handleFallbackMouseMove);
		window.addEventListener("mouseup", endHueDrag);
		window.addEventListener("touchmove", handleFallbackTouchMove, { passive: false });
		window.addEventListener("touchend", endHueDrag);
		window.addEventListener("touchcancel", endHueDrag);
	}

	function detachFallbackDragListeners() {
		if (!fallbackListenersAttached) {
			return;
		}

		fallbackListenersAttached = false;
		window.removeEventListener("mousemove", handleFallbackMouseMove);
		window.removeEventListener("mouseup", endHueDrag);
		window.removeEventListener("touchmove", handleFallbackTouchMove);
		window.removeEventListener("touchend", endHueDrag);
		window.removeEventListener("touchcancel", endHueDrag);
	}

	function endHueDrag() {
		isDraggingHueWheel = false;
		activeTouchId = null;
		detachFallbackDragListeners();
	}

	function updateEditorDisplay() {
		const isBusy = state.isSubmitting;
		if (document.activeElement !== nameInput) {
			nameInput.value = state.editingSceneDraft.name;
		}
		if (document.activeElement !== descriptionInput) {
			descriptionInput.value = state.editingSceneDraft.description;
		}
		brightnessSlider.value = String(state.editingSceneDraft.brightness);
		brightnessValue.textContent = formatPercentLabel(state.editingSceneDraft.brightness);
		updateSliderProgress(brightnessSlider, brightnessSlider.value);
		colorModeButton.dataset.active = String(state.editingSceneDraft.colorMode === "color");
		whiteModeButton.dataset.active = String(state.editingSceneDraft.colorMode === "white");
		offModeButton.dataset.active = String(state.editingSceneDraft.colorMode === "off");
		hueField.hidden = state.editingSceneDraft.colorMode !== "color";
		kelvinField.hidden = state.editingSceneDraft.colorMode !== "white";
		offField.hidden = state.editingSceneDraft.colorMode !== "off";
		brightnessField.hidden = state.editingSceneDraft.colorMode === "off";
		kelvinSlider.value = String(state.editingSceneDraft.kelvin);
		updateSliderProgress(kelvinSlider, kelvinSlider.value);
		const hueText = `${Math.round(state.editingSceneDraft.hue)}° · ${Math.round(state.editingSceneDraft.saturation)}% sat`;
		const indicatorPosition = getHueWheelPosition(state.editingSceneDraft.hue, state.editingSceneDraft.saturation);
		hueIndicator.style.left = `${indicatorPosition.x}%`;
		hueIndicator.style.top = `${indicatorPosition.y}%`;
		const huePreviewColor = getPerceptualHueColor(
			state.editingSceneDraft.hue,
			state.editingSceneDraft.saturation,
			state.editingSceneDraft.brightness
		).cssColor;
		const kelvinText = formatKelvinLabel(state.editingSceneDraft.kelvin);
		const kelvinPreviewColor = getPerceptualKelvinColor(
			state.editingSceneDraft.kelvin,
			state.editingSceneDraft.brightness
		).cssColor;
		hueValue.textContent = hueText;
		kelvinValue.textContent = kelvinText;
		modePreview.style.background = state.editingSceneDraft.colorMode === "off"
			? "rgb(0, 0, 0)"
			: state.editingSceneDraft.colorMode === "white"
				? kelvinPreviewColor
				: huePreviewColor;
		nameInput.disabled = isBusy;
		descriptionInput.disabled = isBusy;
		colorModeButton.disabled = isBusy;
		whiteModeButton.disabled = isBusy;
		offModeButton.disabled = isBusy;
		brightnessSlider.disabled = isBusy;
		kelvinSlider.disabled = isBusy;
		cancelButton.disabled = isBusy;
		saveButton.disabled = isBusy;
		hueWheel.style.pointerEvents = isBusy ? "none" : "";
	}

	nameInput.addEventListener("input", (event) => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			name: event.target.value
		});
		updateEditorDisplay();
	});

	descriptionInput.addEventListener("input", (event) => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			description: event.target.value
		});
	});

	colorModeButton.addEventListener("click", () => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			colorMode: "color",
			brightness: getEditableSceneBrightnessPercent(state.editingSceneDraft.brightness, "color")
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	whiteModeButton.addEventListener("click", () => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			colorMode: "white",
			brightness: getEditableSceneBrightnessPercent(state.editingSceneDraft.brightness, "white")
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	offModeButton.addEventListener("click", () => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			colorMode: "off"
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	brightnessSlider.addEventListener("input", (event) => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			brightness: getEditableSceneBrightnessPercent(event.target.value, state.editingSceneDraft.colorMode)
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	kelvinSlider.addEventListener("input", (event) => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			kelvin: Number(event.target.value)
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	kelvinSlider.addEventListener("change", (event) => {
		actions.onUpdateEditingSceneDraft({
			...state.editingSceneDraft,
			kelvin: Number(event.target.value)
		});
		updateEditorDisplay();
		queueEditorScenePreview(state, queues);
	});

	if (window.PointerEvent) {
		hueWheel.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			isDraggingHueWheel = true;
			hueWheel.setPointerCapture(event.pointerId);
			updateHueFromPointerEvent(event);
		});

		hueWheel.addEventListener("pointermove", (event) => {
			if (!isDraggingHueWheel) {
				return;
			}

			updateHueFromPointerEvent(event);
		});

		hueWheel.addEventListener("pointerup", endHueDrag);
		hueWheel.addEventListener("lostpointercapture", endHueDrag);
	} else {
		// Older iOS Safari lacks Pointer Events, so keep the hue wheel usable with touch/mouse fallback.
		hueWheel.addEventListener("mousedown", (event) => {
			event.preventDefault();
			isDraggingHueWheel = true;
			attachFallbackDragListeners();
			updateHueFromPointerEvent(event);
		});

		hueWheel.addEventListener("touchstart", (event) => {
			if (!event.touches.length) {
				return;
			}

			event.preventDefault();
			isDraggingHueWheel = true;
			activeTouchId = event.touches[0].identifier;
			attachFallbackDragListeners();
			updateHueFromPointerEvent(event.touches[0]);
		}, { passive: false });
	}

	cancelButton.addEventListener("click", () => {
		actions.onClearEditingScene();
	});

	saveButton.addEventListener("click", async () => {
		await actions.onSaveEditingScene();
	});

	updateEditorDisplay();
}
