export function buildAddressGroups(lights, enabledIds) {
  const enabledIdSet = enabledIds instanceof Set ? enabledIds : new Set(enabledIds);
  const groups = new Map();

  for (const light of lights) {
    const key = light.addressGroup;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key,
        count: 0,
        onlineCount: 0,
        enabledCount: 0,
        fullyEnabled: false
      });
    }

    const group = groups.get(key);
    group.count += 1;
    if (light.status === "on") {
      group.onlineCount += 1;
    }
    if (enabledIdSet.has(light.id)) {
      group.enabledCount += 1;
    }
  }

  for (const group of groups.values()) {
    group.targetedCount = group.enabledCount;
    group.fullyEnabled = group.enabledCount === group.count && group.count > 0;
  }

  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function decorateLightsWithTargetState(lights, enabledIds, targetIds) {
  const enabledIdSet = enabledIds instanceof Set ? enabledIds : new Set(enabledIds);
  const targetIdSet = targetIds instanceof Set ? targetIds : new Set(targetIds);

  return lights.map((light) => ({
    ...light,
    enabled: enabledIdSet.has(light.id),
    targeted: targetIdSet.has(light.id)
  }));
}
