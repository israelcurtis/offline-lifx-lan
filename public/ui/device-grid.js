import { replaceNodeChildren } from "../lib/dom-utils.js";
import { getStateLabel, getStateSwatchColor } from "../lib/light-model.js";

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
	const capabilityMeta = document.createElement("span");
	capabilityMeta.className = "pill light-capability-meta";
	const capabilityIcon = document.createElement("img");
	capabilityIcon.className = "light-capability-icon";
	capabilityIcon.src = "/assets/iconoir/regular/light-bulb.svg";
	capabilityIcon.alt = "";
	capabilityIcon.setAttribute("aria-hidden", "true");
	const capabilityLabel = document.createElement("span");
	capabilityLabel.className = "light-capability-label";
	capabilityMeta.append(capabilityIcon, capabilityLabel);
	const targetingPill = document.createElement("button");
	targetingPill.type = "button";
	targetingPill.className = "pill pill-toggle";
	// Pointer enter/leave is patchy on older iPad Safari, so prefer mouse hover here.
	targetingPill.addEventListener("mouseenter", () => {
		targetingPill.classList.add("is-hovered");
	});
	targetingPill.addEventListener("mouseleave", () => {
		targetingPill.classList.remove("is-hovered");
	});
	targetingPill.addEventListener("blur", () => {
		targetingPill.classList.remove("is-hovered");
	});
	const targetingIcon = document.createElement("img");
	targetingIcon.className = "pill-icon pill-toggle-icon";
	targetingIcon.alt = "";
	targetingIcon.setAttribute("aria-hidden", "true");
	targetingPill.append(targetingIcon);

	pillRow.append(targetingPill);
	pillRow.append(onlinePill);
	pillRow.append(capabilityMeta);

	card.append(header, stateLabel, address, identifier, pillRow);

	return card;
}

function updateLightCard(card, light, state, actions) {
	const enabled = isLightEnabled(light);
	const swatch = card.querySelector(".light-swatch");
	const title = card.querySelector("h3");
	const capabilityMeta = card.querySelector(".light-capability-meta");
	const capabilityIcon = card.querySelector(".light-capability-icon");
	const capabilityLabel = card.querySelector(".light-capability-label");
	const address = card.querySelectorAll(".light-identifier-meta")[0];
	const identifier = card.querySelectorAll(".light-identifier-meta")[1];
	const stateLabel = card.querySelector(".light-state-meta");
	const onlinePill = card.querySelector(".pill:not(.pill-toggle)");
	const onlineIcon = onlinePill.querySelector(".pill-icon");
	const targetingPill = card.querySelector(".pill-toggle");
	const targetingIcon = card.querySelector(".pill-toggle-icon");
	const isSavingTargetState = state.isSavingTargetState;

	card.dataset.enabled = String(enabled);
	card.dataset.lightId = light.id;
	if (!light.currentState || light.currentState.power !== "on" || light.currentState.brightness <= 0) {
		swatch.dataset.power = "off";
		swatch.style.background = "";
		swatch.setAttribute("aria-label", "Bulb is off");
	} else {
		swatch.dataset.power = "on";
		swatch.style.background = getStateSwatchColor(light.currentState, light);
		swatch.setAttribute("aria-label", "Bulb is on");
	}
	title.textContent = light.label;
	if (light.capabilities && light.capabilities.color === true) {
		capabilityMeta.hidden = false;
		capabilityMeta.dataset.capability = "rgb";
		replaceNodeChildren(capabilityLabel, []);
		for (const [letter, className] of [["R", "rgb-r"], ["G", "rgb-g"], ["B", "rgb-b"]]) {
			const letterSpan = document.createElement("span");
			letterSpan.className = `light-capability-letter ${className}`;
			letterSpan.textContent = letter;
			capabilityLabel.appendChild(letterSpan);
		}
		capabilityMeta.title = "RGB-capable bulb";
		capabilityMeta.setAttribute("aria-label", "RGB-capable bulb");
	} else if (light.capabilities && light.capabilities.color === false) {
		capabilityMeta.hidden = false;
		capabilityMeta.dataset.capability = "white";
		replaceNodeChildren(capabilityLabel, []);
		capabilityLabel.textContent = "WHT";
		capabilityMeta.title = "White-only bulb";
		capabilityMeta.setAttribute("aria-label", "White-only bulb");
	} else {
		capabilityMeta.hidden = true;
		capabilityMeta.dataset.capability = "";
		replaceNodeChildren(capabilityLabel, []);
		capabilityMeta.removeAttribute("title");
		capabilityMeta.removeAttribute("aria-label");
	}
	address.textContent = light.address;
	identifier.textContent = `ID: ${light.id}`;
	stateLabel.textContent = getStateLabel(light.currentState, light);
	stateLabel.dataset.pending = String(!light.currentState);

	onlinePill.classList.add("pill");
	onlinePill.classList.toggle("online", light.status === "on");
	onlinePill.classList.toggle("offline", light.status !== "on");
	onlinePill.setAttribute("aria-label", light.status === "on" ? "Online" : "Offline");
	onlinePill.title = light.status === "on" ? "Online" : "Offline";
	const onlineIconSrc = light.status === "on"
		? "/assets/iconoir/regular/wifi.svg"
		: "/assets/iconoir/solid/warning-triangle.svg";
	if (onlineIcon.getAttribute("src") !== onlineIconSrc) {
		onlineIcon.src = onlineIconSrc;
	}

	targetingPill.classList.add("pill", "pill-toggle");
	targetingPill.classList.toggle("enabled", enabled);
	targetingPill.classList.toggle("disabled", !enabled);
	targetingIcon.hidden = false;
	const targetingIconSrc = enabled
		? "/assets/iconoir/solid/plus-circle.svg"
		: "/assets/iconoir/regular/xmark-circle.svg";
	if (targetingIcon.getAttribute("src") !== targetingIconSrc) {
		targetingIcon.src = targetingIconSrc;
	}
	targetingPill.disabled = isSavingTargetState || !(state.currentStatus && state.currentStatus.manualTargetingEnabled);
	if (targetingPill.disabled) {
		targetingPill.classList.remove("is-hovered");
	}
	targetingPill.setAttribute(
		"aria-label",
		enabled ? `Disable ${light.label}` : `Enable ${light.label}`
	);
	targetingPill.onclick = state.currentStatus && state.currentStatus.manualTargetingEnabled ? () => actions.onToggleTarget(light.id) : null;
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

function updateDeviceGroupSection(wrapper, group, groupLights, state, actions) {
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
	enableButton.disabled = state.isSavingTargetState || !(state.currentStatus && state.currentStatus.manualTargetingEnabled);
	disableButton.disabled = state.isSavingTargetState || !(state.currentStatus && state.currentStatus.manualTargetingEnabled);
	enableButton.onclick = () => actions.onToggleAddressGroup(group.key, true);
	disableButton.onclick = () => actions.onToggleAddressGroup(group.key, false);

	const existingCardsById = new Map(
		[...grid.querySelectorAll(".light-card")].map((card) => [card.dataset.lightId, card])
	);
	const nextCards = groupLights.map((light) => {
		const card = existingCardsById.get(light.id) || createLightCard();
		updateLightCard(card, light, state, actions);
		return card;
	});
	replaceNodeChildren(grid, nextCards);
}

export function renderDeviceGrid({ lightGrid, state, actions }) {
	const lights = state.currentStatus && state.currentStatus.lights ? state.currentStatus.lights : [];
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
	const nextGroups = (state.currentStatus && state.currentStatus.addressGroups ? state.currentStatus.addressGroups : []).map((group) => {
		const wrapper = existingGroupsByKey.get(group.key) || createDeviceGroupSection();
		const groupLights = (groupedLights.get(group.key) || [])
			.slice()
			.sort((left, right) => left.label.localeCompare(right.label));
		updateDeviceGroupSection(wrapper, group, groupLights, state, actions);
		return wrapper;
	});

	replaceNodeChildren(lightGrid, nextGroups);
}
