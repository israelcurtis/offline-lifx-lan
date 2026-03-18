export function updateSliderProgress(slider, value) {
	const min = Number(slider.min || 0);
	const max = Number(slider.max || 100);
	const numericValue = Number(value);
	const ratio = max === min ? 0 : ((numericValue - min) / (max - min)) * 100;
	slider.style.setProperty("--slider-progress", `${Math.min(100, Math.max(0, ratio))}%`);
}
