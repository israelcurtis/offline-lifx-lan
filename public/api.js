async function fetchJson(url, options = {}) {
	const response = await fetch(url, options);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error ?? "Request failed.");
	}

	return payload;
}

export async function loadStatus() {
	return fetchJson("/api/status");
}

export async function applyScene(sceneId) {
	return fetchJson(`/api/scenes/${sceneId}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		}
	});
}

export async function updateScene(sceneId, sceneValues) {
	return fetchJson(`/api/scenes/${sceneId}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(sceneValues)
	});
}

export async function saveTargets(knownDevices) {
	return fetchJson("/api/targets", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ devices: knownDevices })
	});
}

export async function saveAddressGroupState(addressGroup, enabled) {
	return fetchJson("/api/address-groups", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ addressGroup, enabled })
	});
}

export async function saveTransitionDuration(transitionDurationMs) {
	return fetchJson("/api/transition-duration", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ transitionDurationMs })
	});
}

export async function saveLiveBrightness(brightnessPercent) {
	return fetchJson("/api/brightness", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ brightnessPercent })
	});
}

export async function saveScenePreview(sceneValues) {
	return fetchJson("/api/scene-preview", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(sceneValues)
	});
}

export async function discoverLan() {
	return fetchJson("/api/discover", { method: "POST" });
}

export async function restartServer() {
	return fetchJson("/api/restart", { method: "POST" });
}

export async function waitForServerReady(timeoutMs = 30000) {
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
