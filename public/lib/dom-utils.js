export function updateSliderProgress(slider, value) {
	const min = Number(slider.min || 0);
	const max = Number(slider.max || 100);
	const numericValue = Number(value);
	const ratio = max === min ? 0 : ((numericValue - min) / (max - min)) * 100;
	slider.style.setProperty("--slider-progress", `${Math.min(100, Math.max(0, ratio))}%`);
}

export function replaceNodeChildren(node, children) {
	// Safari 12 does not support replaceChildren(), so keep the compatibility shim
	// centralized and easy to remove once old-browser support is no longer needed.
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}

	for (const child of children) {
		node.appendChild(child);
	}
}

export function mediaQueryMatches(query) {
	// Keep matchMedia usage behind a guard for older browser support.
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}

	return window.matchMedia(query).matches;
}
