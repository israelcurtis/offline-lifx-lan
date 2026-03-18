import {
	getSceneButtonAppearance,
	getSceneButtonBorder,
	getSceneButtonForeground,
	getSceneIconFilter,
	sceneDescription,
	sceneSettingsLabel
} from "../lib/light-model.js";

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

function getSceneCardState(scene, state) {
	const isActive = state.currentStatus?.lastAction?.sceneId === scene.id;
	const isShowingFeedback = state.sceneFeedbackId === scene.id;
	const isEditing = state.editingSceneId === scene.id;
	const actionableTargetCount = state.currentStatus?.lights?.filter((light) => light.enabled !== false && light.status === "on").length ?? 0;
	const isUnavailable = !state.editingSceneId && actionableTargetCount === 0;
	const isDisabled = state.editingSceneId ? !isEditing : isUnavailable;
	// Keep focus and disabled behavior explicit here so scene-card styling and interaction rules
	// stay in sync. While editing, the active card remains usable and all others become muted/disabled.
	const focusState = state.editingSceneId
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

function updateSceneCard(card, scene, state, actions) {
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
		focusState,
		isDisabled
	} = getSceneCardState(scene, state);

	card.dataset.sceneId = scene.id;
	card.dataset.active = String(isActive);
	card.dataset.focus = focusState;
	card.dataset.disabled = String(isDisabled);
	title.textContent = scene.name;
	description.textContent = sceneDescription(scene);
	settings.textContent = sceneSettingsLabel(scene);
	editButton.disabled = state.isSubmitting || isDisabled;
	editButton.setAttribute("aria-label", `Edit ${scene.name}`);
	editButton.onclick = () => {
		if (state.editingSceneId === scene.id) {
			actions.onClearEditingScene();
			return;
		}

		actions.onSetEditingScene(scene);
	};
	button.onclick = () => actions.onApplyScene(scene.id);
	const buttonAppearance = getSceneButtonAppearance(scene, state.currentStatus?.defaultSceneKelvin);
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
		buttonLabel.textContent = state.sceneFeedbackLabel ?? "Applied";
		buttonLabel.hidden = false;
		buttonIcon.hidden = true;
	} else {
		buttonLabel.hidden = true;
		buttonIcon.hidden = false;
	}
	button.dataset.sceneTriggerId = scene.id;
	button.dataset.applied = String(isShowingFeedback);
	button.setAttribute("aria-label", isActive ? `${scene.name} applied` : `Trigger ${scene.name}`);
	button.style.setProperty("--scene-transition-ms", `${state.currentStatus?.transitionDurationMs ?? 1000}ms`);
	button.disabled = state.isSubmitting || isDisabled;
}

export function renderSceneGrid({ sceneGrid, state, actions }) {
	const scenes = state.currentStatus?.scenes ?? [];
	const existingCards = [...sceneGrid.querySelectorAll(".scene-card")];
	const nextCards = scenes.map((scene, index) => {
		const card = existingCards[index] ?? createSceneCard(scene);
		updateSceneCard(card, scene, state, actions);
		return card;
	});

	sceneGrid.replaceChildren(...nextCards);
}
