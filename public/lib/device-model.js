export function isActionableLight(light) {
	return Boolean(light) && light.enabled !== false && light.status === "on";
}

export function getActionableLightCount(lights) {
	return (lights || []).filter(isActionableLight).length;
}

export function applyOptimisticKnownDeviceState(currentStatus, knownDevices) {
	if (!currentStatus) {
		return currentStatus;
	}

	// Device enable/disable is local controller state. Update the optimistic snapshot
	// immediately so the UI can reflect the new state without waiting for a poll round-trip.
	const knownDeviceMap = new Map((knownDevices || []).map((device) => [device.id, device]));
	const nextLights = (currentStatus.lights || []).map((light) => {
		const knownDevice = knownDeviceMap.get(light.id);
		const enabled = knownDevice && knownDevice.enabled != null
			? knownDevice.enabled
			: light.enabled != null
				? light.enabled
				: true;
		return {
			...light,
			enabled,
			targeted: enabled
		};
	});

	const addressGroups = (currentStatus.addressGroups || []).map((group) => {
		const groupLights = nextLights.filter((light) => light.addressGroup === group.key);
		const enabledCount = groupLights.filter((light) => light.enabled).length;
		return {
			...group,
			enabledCount,
			targetedCount: enabledCount,
			fullyEnabled: enabledCount === group.count && group.count > 0
		};
	});

	return {
		...currentStatus,
		knownDevices,
		targetedCount: nextLights.filter((light) => light.enabled).length,
		addressGroups,
		lights: nextLights
	};
}
