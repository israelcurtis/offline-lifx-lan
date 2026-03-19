import { getActionableLightCount } from "./device-model.js";
import {
	DEFAULT_SCENE_KELVIN,
	LIGHT_WHITE_SATURATION_THRESHOLD_PERCENT,
	deriveSceneId,
	inferSceneMode,
	normalizeBrightnessPercent
} from "/shared/domain.js";

export { deriveSceneId, inferSceneMode, normalizeBrightnessPercent } from "/shared/domain.js";

export const MIN_SCENE_BRIGHTNESS_PERCENT = 5;
export const FALLBACK_DEFAULT_SCENE_KELVIN = DEFAULT_SCENE_KELVIN;
export const supportsOklch = typeof CSS !== "undefined"
	&& typeof CSS.supports === "function"
	&& CSS.supports("color", "oklch(62% 0.16 210)");

export function clampNumber(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

export function formatDurationLabel(durationMs) {
	return `${Math.round(durationMs)}ms`;
}

export function formatBrightnessLabel(brightnessPercent) {
	if (brightnessPercent == null) {
		return "--";
	}

	return `${Math.round(brightnessPercent)}%`;
}

export function formatPercentLabel(value) {
	return `${Math.round(value)}%`;
}

export function formatKelvinLabel(kelvin) {
	return `${Math.round(kelvin)}K`;
}

export function getEditableSceneBrightnessPercent(brightnessPercent, colorMode) {
	const normalizedBrightness = clampNumber(Number(brightnessPercent) || 0, 0, 100);
	return colorMode === "off"
		? 0
		: clampNumber(normalizedBrightness, MIN_SCENE_BRIGHTNESS_PERCENT, 100);
}

export function getDefaultSceneKelvin(currentStatus, fallback = FALLBACK_DEFAULT_SCENE_KELVIN) {
	const defaultSceneKelvin = currentStatus && currentStatus.defaultSceneKelvin != null
		? currentStatus.defaultSceneKelvin
		: fallback;
	return Math.round(defaultSceneKelvin);
}

function hsbToRgb(hue, saturation, brightness) {
	const s = saturation / 100;
	const v = brightness / 100;
	const chroma = v * s;
	const huePrime = (((hue % 360) + 360) % 360) / 60;
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

export function kelvinToRgb(kelvin) {
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
	const lastAnchor = anchors[anchors.length - 1];

	if (kelvin <= anchors[0].kelvin) {
		return anchors[0].rgb;
	}

	// Safari 12 lacks Array.prototype.at(), so keep the last-anchor lookup explicit.
	if (kelvin >= lastAnchor.kelvin) {
		return lastAnchor.rgb;
	}

	for (let index = 0; index < anchors.length - 1; index += 1) {
		const left = anchors[index];
		const right = anchors[index + 1];
		if (kelvin >= left.kelvin && kelvin <= right.kelvin) {
			const ratio = (kelvin - left.kelvin) / (right.kelvin - left.kelvin);
			return interpolateRgb(left.rgb, right.rgb, ratio);
		}
	}

	return lastAnchor.rgb;
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

function scaleKelvinSwatchBrightness(rgb, brightness) {
	const factor = (55 + (brightness * 0.45)) / 100;
	return {
		red: Math.round(rgb.red * factor),
		green: Math.round(rgb.green * factor),
		blue: Math.round(rgb.blue * factor)
	};
}

export function getPerceptualHueColor(hue, saturation, brightnessPercent) {
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

export function getPerceptualKelvinColor(kelvin, brightnessPercent) {
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

export function getSceneButtonAppearance(scene, defaultSceneKelvin = FALLBACK_DEFAULT_SCENE_KELVIN) {
	if (scene.power === "off" || Number(scene.brightness == null ? 0 : scene.brightness) <= 0) {
		return {
			cssColor: "rgb(0, 0, 0)",
			rgb: { red: 0, green: 0, blue: 0 }
		};
	}

	if (inferSceneMode(scene) === "white") {
		return getPerceptualKelvinColor(
			scene.kelvin == null ? defaultSceneKelvin : scene.kelvin,
			Math.round((scene.brightness == null ? 0 : scene.brightness) * 100)
		);
	}

	return getPerceptualHueColor(
		scene.hue == null ? 0 : scene.hue,
		Math.max(22, Math.round((scene.saturation == null ? 0 : scene.saturation) * 100)),
		Math.round((scene.brightness == null ? 0 : scene.brightness) * 100)
	);
}

export function getSceneButtonBorder(scene) {
	if (scene.power === "off") {
		return "rgba(255, 255, 255, 0.12)";
	}

	if (inferSceneMode(scene) === "white") {
		return "rgba(31, 28, 24, 0.16)";
	}

	return "rgba(255, 255, 255, 0.16)";
}

export function getSceneIconFilter(rgb) {
	const luminance = ((0.2126 * rgb.red) + (0.7152 * rgb.green) + (0.0722 * rgb.blue)) / 255;
	return luminance > 0.68
		? "brightness(0) saturate(100%)"
		: "brightness(0) invert(1)";
}

export function getSceneButtonForeground(rgb) {
	const luminance = ((0.2126 * rgb.red) + (0.7152 * rgb.green) + (0.0722 * rgb.blue)) / 255;
	return luminance > 0.68 ? "#1f1c18" : "#ffffff";
}

export function sceneDescription(scene) {
	return scene.description;
}

export function sceneSettingsLabel(scene) {
	if (scene.power === "off") {
		return "Power: Off";
	}

	if (inferSceneMode(scene) === "white") {
		return `${Math.round(scene.brightness * 100)}% brightness · ${scene.kelvin}K`;
	}

	return `${Math.round(scene.brightness * 100)}% brightness · ${Math.round(scene.hue)}° hue`;
}

export function makeSceneDraft(scene, defaultSceneKelvin = FALLBACK_DEFAULT_SCENE_KELVIN) {
	const colorMode = inferSceneMode(scene);
	return {
		name: scene.name,
		description: scene.description == null ? "" : scene.description,
		hue: Math.round(scene.hue == null ? 0 : scene.hue),
		saturation: Math.round((scene.saturation == null ? 0 : scene.saturation) * 100),
		brightness: getEditableSceneBrightnessPercent(Math.round((scene.brightness == null ? 0 : scene.brightness) * 100), colorMode),
		kelvin: Math.round(scene.kelvin == null ? defaultSceneKelvin : scene.kelvin),
		colorMode
	};
}

export function buildEditingSceneValues(editingSceneDraft, defaultSceneKelvin = FALLBACK_DEFAULT_SCENE_KELVIN) {
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
			: defaultSceneKelvin
	};
}

export function getHueWheelPosition(hue, saturation) {
	const angle = ((Number(hue) % 360) * Math.PI) / 180;
	const radius = Math.max(0, Math.min(1, Number(saturation) / 100));
	return {
		x: 50 + (Math.cos(angle) * radius * 50),
		y: 50 + (Math.sin(angle) * radius * 50)
	};
}

export function updateSceneDraftFromWheel(draft, event, wheel) {
	const rect = wheel.getBoundingClientRect();
	const offsetX = event.clientX - rect.left - (rect.width / 2);
	const offsetY = event.clientY - rect.top - (rect.height / 2);
	const radius = rect.width / 2;
	const normalizedDistance = Math.min(1, Math.sqrt((offsetX ** 2) + (offsetY ** 2)) / radius);
	const angle = (Math.atan2(offsetY, offsetX) * (180 / Math.PI) + 360) % 360;

	return {
		...draft,
		hue: Math.round(angle),
		saturation: Math.round(normalizedDistance * 100)
	};
}

export function getStateSwatchColor(currentState, light) {
	if (!currentState || currentState.power !== "on" || currentState.brightness <= 0) {
		return "transparent";
	}

	if (
		(light && light.capabilities && light.capabilities.color === false)
		|| normalizeBrightnessPercent(currentState.saturation) <= LIGHT_WHITE_SATURATION_THRESHOLD_PERCENT
	) {
		return getPerceptualKelvinColor(currentState.kelvin, currentState.brightness).cssColor;
	}

	return getPerceptualHueColor(
		currentState.hue,
		currentState.saturation,
		currentState.brightness
	).cssColor;
}

export function getStateLabel(currentState, light) {
	if (!currentState) {
		return "awaiting response";
	}

	if (currentState.power !== "on") {
		return "Off";
	}

	if (
		(light && light.capabilities && light.capabilities.color === false)
		|| normalizeBrightnessPercent(currentState.saturation) <= LIGHT_WHITE_SATURATION_THRESHOLD_PERCENT
	) {
		return `${Math.round(currentState.brightness)}% · ${Math.round(currentState.kelvin)}K`;
	}

	return `${Math.round(currentState.brightness)}% · ${Math.round(currentState.hue)}° hue`;
}

export function hasLiveScenePreviewTargets(currentStatus) {
	return getActionableLightCount(currentStatus ? currentStatus.lights : null) > 0;
}
