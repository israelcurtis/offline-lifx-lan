export function createAppStore() {
	const state = {
		currentStatus: null,
		activeActivityMessage: "",
		activeActivityKind: "",
		isSubmitting: false,
		isAdjustingTransitionDuration: false,
		isAdjustingLiveBrightness: false,
		isSavingTargetState: false,
		editingSceneId: null,
		editingSceneDraft: null,
		hasLiveScenePreview: false,
		sceneFeedbackId: null,
		sceneFeedbackLabel: null
	};
	const listeners = new Set();
	let activityClearTimer = null;
	let sceneFeedbackTimer = null;

	function emit() {
		for (const listener of listeners) {
			listener(state);
		}
	}

	function clearActivityTimer() {
		if (activityClearTimer) {
			clearTimeout(activityClearTimer);
			activityClearTimer = null;
		}
	}

	function clearSceneFeedbackTimer() {
		if (sceneFeedbackTimer) {
			clearTimeout(sceneFeedbackTimer);
			sceneFeedbackTimer = null;
		}
	}

	return {
		state,
		getState() {
			return state;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		setStatus(payload) {
			state.currentStatus = payload;
			emit();
		},
		setSubmitting(next) {
			state.isSubmitting = next;
			emit();
		},
		setActivity(message = "", { kind = "", autoClearMs = 0 } = {}) {
			clearActivityTimer();
			state.activeActivityMessage = message;
			state.activeActivityKind = message ? kind : "";
			emit();
			if (message && autoClearMs > 0) {
				activityClearTimer = setTimeout(() => {
					activityClearTimer = null;
					state.activeActivityMessage = "";
					state.activeActivityKind = "";
					emit();
				}, autoClearMs);
			}
		},
		setSceneFeedback(sceneId, label) {
			clearSceneFeedbackTimer();
			state.sceneFeedbackId = sceneId;
			state.sceneFeedbackLabel = label;
			emit();
			sceneFeedbackTimer = setTimeout(() => {
				sceneFeedbackTimer = null;
				state.sceneFeedbackId = null;
				state.sceneFeedbackLabel = null;
				emit();
			}, 4000);
		},
		setTargetSaveState(next) {
			state.isSavingTargetState = next;
			emit();
		},
		setAdjustingTransitionDuration(next) {
			state.isAdjustingTransitionDuration = next;
			emit();
		},
		setAdjustingLiveBrightness(next) {
			state.isAdjustingLiveBrightness = next;
			emit();
		},
		setEditingScene(sceneId, draft) {
			state.editingSceneId = sceneId;
			state.editingSceneDraft = draft;
			state.hasLiveScenePreview = false;
			emit();
		},
		setEditingSceneDraft(draft) {
			state.editingSceneDraft = draft;
			emit();
		},
		clearEditingScene() {
			state.editingSceneId = null;
			state.editingSceneDraft = null;
			emit();
		},
		setLiveScenePreview(next) {
			state.hasLiveScenePreview = next;
			emit();
		},
		cancelTimers() {
			clearActivityTimer();
			clearSceneFeedbackTimer();
		}
	};
}
