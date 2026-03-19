export function createLiveCommandQueue({
	dispatchIntervalMs,
	refreshDelayMs = 0,
	save,
	onSuccess,
	onError,
	refresh
}) {
	// Shared live-control queue for brightness override and scene preview.
	// It coalesces rapid UI changes down to the newest payload, avoids overlapping requests,
	// and schedules a later status refresh so optimistic UI can reconcile with reported bulb state.
	let requestInFlight = false;
	let pendingPayload = null;
	let dispatchTimer = null;
	let refreshTimer = null;
	const idleResolvers = [];

	function resolveIdleWaiters() {
		if (requestInFlight || pendingPayload != null || dispatchTimer) {
			return;
		}

		for (const resolve of idleResolvers.splice(0)) {
			resolve();
		}
	}

	function scheduleRefresh() {
		if (!refresh || refreshDelayMs <= 0) {
			return;
		}

		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}

		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			refresh();
		}, refreshDelayMs);
	}

	async function flush() {
		if (requestInFlight || pendingPayload == null) {
			resolveIdleWaiters();
			return;
		}

		const nextPayload = pendingPayload;
		pendingPayload = null;
		requestInFlight = true;

		try {
			const result = await save(nextPayload);
			if (onSuccess) {
				onSuccess(result, nextPayload);
			}
		} catch (error) {
			if (onError) {
				onError(error, nextPayload);
			}
		} finally {
			requestInFlight = false;
			if (pendingPayload != null) {
				void flush();
			} else {
				scheduleRefresh();
				resolveIdleWaiters();
			}
		}
	}

	return {
		queue(payload) {
			pendingPayload = payload;
			if (dispatchTimer) {
				return;
			}

			dispatchTimer = setTimeout(() => {
				dispatchTimer = null;
				void flush();
			}, dispatchIntervalMs);
		},
		async flushNow() {
			if (dispatchTimer) {
				clearTimeout(dispatchTimer);
				dispatchTimer = null;
			}

			if (pendingPayload != null) {
				await flush();
			}

			if (requestInFlight || pendingPayload != null || dispatchTimer) {
				await this.waitForIdle();
			}
		},
		waitForIdle() {
			if (!requestInFlight && pendingPayload == null && !dispatchTimer) {
				return Promise.resolve();
			}

			return new Promise((resolve) => {
				idleResolvers.push(resolve);
			});
		},
		clearPending() {
			if (dispatchTimer) {
				clearTimeout(dispatchTimer);
				dispatchTimer = null;
			}
			if (refreshTimer) {
				clearTimeout(refreshTimer);
				refreshTimer = null;
			}
			pendingPayload = null;
			resolveIdleWaiters();
		},
		scheduleRefresh,
		isRequestInFlight() {
			return requestInFlight;
		}
	};
}
