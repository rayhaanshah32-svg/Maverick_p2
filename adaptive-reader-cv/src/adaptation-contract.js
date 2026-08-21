const AdaptationContract = (function () {

    var COOLDOWN_MS = 12000;
    var LINE_HEATMAP_UPDATE_INTERVAL_MS = 3000;
    var PROACTIVE_SIGNAL_DEGRADED_THRESHOLD_MS = 3500;

    var lastAdaptationTimestamp = 0;
    var lastAdaptationState = null;
    var lastEmittedState = null;
    var lastSmoothedScore = 25;

    var isProactiveAssistActive = false;
    var lowSignalStartTime = null;
    var proactiveTriggerCount = 0;

    var heatmapTimerId = null;

    var eventListeners = {};

    function on(eventName, callback) {
        if (!eventListeners[eventName]) {
            eventListeners[eventName] = [];
        }
        eventListeners[eventName].push(callback);
    }

    function off(eventName, callback) {
        if (!eventListeners[eventName]) {
            return;
        }
        eventListeners[eventName] = eventListeners[eventName].filter(function (item) {
            return item !== callback;
        });
    }

    function emit(eventName, data) {
        var listeners = eventListeners[eventName];
        if (!listeners || listeners.length === 0) {
            return;
        }
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i](data);
            } catch (error) {
                console.error("[AdaptationContract] Listener error for", eventName, error);
            }
        }
    }

    function getStateSeverity(state) {
        if (state === DifficultyEngine.STATES.FLOW) { return 0; }
        if (state === DifficultyEngine.STATES.MILD_FRICTION) { return 1; }
        if (state === DifficultyEngine.STATES.HIGH_FRICTION) { return 2; }
        if (state === DifficultyEngine.STATES.ASSIST) { return 3; }
        return 0;
    }

    function isEscalation(fromState, toState) {
        return getStateSeverity(toState) > getStateSeverity(fromState);
    }

    function mapEvidenceToHumanReadable(evidenceLabel) {
        if (evidenceLabel === "regression_rate") {
            return "repeated_line_revisit";
        }
        if (evidenceLabel === "fixation_anomaly") {
            return "prolonged_fixation";
        }
        if (evidenceLabel === "reading_speed_slowdown") {
            return "reading_speed_slowdown";
        }
        if (evidenceLabel === "dwell_pause_anomaly") {
            return "prolonged_dwell";
        }
        if (evidenceLabel === "line_transition_instability") {
            return "line_transition_instability";
        }
        return evidenceLabel;
    }

    function pickAction(state, evidenceLabels) {
        if (state === DifficultyEngine.STATES.FLOW) {
            return "NONE";
        }

        var hasRegression = evidenceLabels.indexOf("regression_rate") >= 0;
        var hasFixation = evidenceLabels.indexOf("fixation_anomaly") >= 0;
        var hasSpeed = evidenceLabels.indexOf("reading_speed_slowdown") >= 0;

        if (state === DifficultyEngine.STATES.MILD_FRICTION) {
            return "LIGHT_SPACING";
        }

        if (state === DifficultyEngine.STATES.HIGH_FRICTION) {
            if (hasRegression) {
                return "FOCUS_LINE";
            }
            if (hasFixation) {
                return "REDUCE_VISUAL_CROWDING";
            }
            return "FOCUS_LINE";
        }

        if (state === DifficultyEngine.STATES.ASSIST) {
            if (hasSpeed && hasFixation) {
                return "OFFER_SIMPLIFICATION";
            }
            if (hasRegression) {
                return "OFFER_TTS";
            }
            return "OFFER_SIMPLIFICATION";
        }

        return "NONE";
    }

    function shouldEmitAdaptation(newState, currentTime) {
        if (newState === DifficultyEngine.STATES.FLOW) {
            return false;
        }

        var cooldownElapsed = (currentTime - lastAdaptationTimestamp) >= COOLDOWN_MS;

        if (!cooldownElapsed) {
            var escalating = isEscalation(lastAdaptationState, newState);
            if (!escalating) {
                return false;
            }
        }

        return true;
    }

    function computeLineDifficultyHeatmap(lineStats, overallSmoothedScore) {
        var lineIndexes = Object.keys(lineStats);
        if (lineIndexes.length === 0) {
            return [];
        }

        var heatmap = [];

        for (var i = 0; i < lineIndexes.length; i++) {
            var lineIndex = parseInt(lineIndexes[i], 10);
            var stats = lineStats[lineIndex];

            var dwellScore = Math.min(stats.dwellMs / 8000, 1) * 40;
            var fixationScore = Math.min(stats.fixationMs / 3000, 1) * 30;
            var revisitScore = Math.min(stats.revisitCount / 3, 1) * 20;
            var regressionScore = Math.min(stats.regressionEntries / 2, 1) * 10;

            var rawLineFriction = dwellScore + fixationScore + revisitScore + regressionScore;
            rawLineFriction = Math.round(Math.min(rawLineFriction, 100));

            heatmap.push({
                lineIndex: lineIndex,
                dwellMs: stats.dwellMs,
                fixationMs: stats.fixationMs,
                visitCount: stats.visitCount,
                revisitCount: stats.revisitCount,
                regressionEntries: stats.regressionEntries,
                frictionScore: rawLineFriction
            });
        }

        return heatmap;
    }

    function evaluateProactiveSafetyNet(signalQuality, currentTime) {
        if (signalQuality < 45) {
            if (!lowSignalStartTime) {
                lowSignalStartTime = currentTime;
            } else if (currentTime - lowSignalStartTime >= PROACTIVE_SIGNAL_DEGRADED_THRESHOLD_MS) {
                if (!isProactiveAssistActive) {
                    isProactiveAssistActive = true;
                    emit("onProactiveAssistStatusChange", {
                        active: true,
                        reason: "camera_signal_degraded",
                        message: "Proactive Assist Mode active (AI assistance available on-demand)",
                        timestamp: currentTime
                    });
                    console.log("[AdaptationContract] Proactive Assist Mode engaged (signal degraded).");
                }
            }
        } else {
            if (isProactiveAssistActive && lowSignalStartTime !== null) {
                isProactiveAssistActive = false;
                emit("onProactiveAssistStatusChange", {
                    active: false,
                    reason: "camera_signal_restored",
                    message: "Camera eye-tracking resumed",
                    timestamp: currentTime
                });
                console.log("[AdaptationContract] Camera signal restored. Returned to real-time gaze mode.");
            }
            lowSignalStartTime = null;
        }
    }

    function handleMetricsReady(metrics) {
        var difficultyUpdate = DifficultyEngine.computeUpdate(metrics);

        var currentTime = Date.now();
        var newState = difficultyUpdate.state;
        var newSmoothedScore = difficultyUpdate.smoothedScore;

        evaluateProactiveSafetyNet(metrics.signalQuality, currentTime);

        var humanReadableEvidence = difficultyUpdate.evidenceLabels.map(mapEvidenceToHumanReadable);

        var stateReadingUpdate = {
            state: newState,
            score: newSmoothedScore,
            smoothedScore: newSmoothedScore,
            currentLine: metrics.currentLine,
            currentParagraph: metrics.currentParagraph,
            currentWPM: metrics.wpm.currentWPM,
            baselineWPM: metrics.wpm.baselineWPM,
            fixationMs: metrics.fixations.recentMedianMs,
            baselineFixationMs: metrics.baseline.baselineFixationMs,
            regressions: metrics.regressions.recentCount,
            revisits: metrics.revisits.revisitCount,
            pauseMs: metrics.pause.currentMs,
            signalQuality: metrics.signalQuality,
            confidence: metrics.signalQuality / 100,
            evidence: humanReadableEvidence,
            evidenceRaw: difficultyUpdate.evidenceLabels,
            evidenceDetail: difficultyUpdate.evidence,
            contributions: difficultyUpdate.contributions,
            allContributions: difficultyUpdate.allContributions,
            proactiveAssistActive: isProactiveAssistActive,
            timestamp: currentTime
        };

        emit("onReadingStateUpdate", stateReadingUpdate);

        var scoreChanged = Math.abs(newSmoothedScore - lastSmoothedScore) >= 2;
        if (scoreChanged) {
            emit("onReadingFrictionUpdate", {
                score: difficultyUpdate.rawScore,
                smoothedScore: newSmoothedScore,
                gatedScore: difficultyUpdate.gatedScore,
                state: newState,
                evidence: humanReadableEvidence,
                evidenceRaw: difficultyUpdate.evidenceLabels,
                contributions: difficultyUpdate.contributions,
                allContributions: difficultyUpdate.allContributions,
                signalQuality: metrics.signalQuality,
                timestamp: currentTime
            });
            lastSmoothedScore = newSmoothedScore;
        }

        if (shouldEmitAdaptation(newState, currentTime)) {
            var action = pickAction(newState, difficultyUpdate.evidenceLabels);

            var adaptationPayload = {
                state: newState,
                score: newSmoothedScore,
                currentLine: metrics.currentLine,
                evidence: humanReadableEvidence,
                recommendedAction: action,
                signalQuality: metrics.signalQuality,
                action: action,
                difficulty: newSmoothedScore,
                reason: humanReadableEvidence,
                lineIndex: metrics.currentLine,
                confidence: difficultyUpdate.signalQuality / 100,
                timestamp: currentTime
            };

            emit("onAdaptationRecommendation", adaptationPayload);

            lastAdaptationTimestamp = currentTime;
            lastAdaptationState = newState;

            console.log("[AdaptationContract] Adaptation recommendation emitted:", adaptationPayload);
        }

        lastEmittedState = newState;
    }

    function emitLineDifficultyHeatmap() {
        var metrics = ReadingStateEngine.getCurrentMetrics();
        var smoothedScore = DifficultyEngine.getCurrentSmoothedScore();
        var heatmap = computeLineDifficultyHeatmap(metrics.lineStats, smoothedScore);

        if (heatmap.length > 0) {
            emit("onLineDifficultyUpdate", {
                heatmap: heatmap,
                timestamp: Date.now()
            });
        }
    }

    function triggerManualProactiveAssist(targetLineIndex, forcedAction) {
        var action = forcedAction || "OFFER_SIMPLIFICATION";
        var line = targetLineIndex !== undefined ? targetLineIndex : 0;
        proactiveTriggerCount++;

        var proactivePayload = {
            state: "ASSIST",
            score: 75,
            currentLine: line,
            evidence: ["manual_proactive_trigger", "content_complexity"],
            recommendedAction: action,
            signalQuality: 100,
            action: action,
            difficulty: 75,
            reason: ["manual_proactive_trigger"],
            lineIndex: line,
            confidence: 1.0,
            isProactiveManual: true,
            timestamp: Date.now()
        };

        emit("onAdaptationRecommendation", proactivePayload);
        console.log("[AdaptationContract] Proactive Assist manual trigger fired:", proactivePayload);
        return proactivePayload;
    }

    function enableProactiveAssist(reason) {
        isProactiveAssistActive = true;
        emit("onProactiveAssistStatusChange", {
            active: true,
            reason: reason || "manual_enable",
            message: "Proactive Assist Mode active (Fallback AI Assistance)",
            timestamp: Date.now()
        });
    }

    function disableProactiveAssist() {
        isProactiveAssistActive = false;
        lowSignalStartTime = null;
        emit("onProactiveAssistStatusChange", {
            active: false,
            reason: "manual_disable",
            message: "Proactive Assist Mode deactivated",
            timestamp: Date.now()
        });
    }

    function getProactiveAssistStatus() {
        return {
            active: isProactiveAssistActive,
            triggerCount: proactiveTriggerCount
        };
    }

    function initialize() {
        ReadingStateEngine.on("onMetricsReady", handleMetricsReady);
        heatmapTimerId = setInterval(emitLineDifficultyHeatmap, LINE_HEATMAP_UPDATE_INTERVAL_MS);
        console.log("[AdaptationContract] Initialized.");
    }

    function stop() {
        if (heatmapTimerId) {
            clearInterval(heatmapTimerId);
            heatmapTimerId = null;
        }
    }

    function reset() {
        lastAdaptationTimestamp = 0;
        lastAdaptationState = null;
        lastEmittedState = null;
        lastSmoothedScore = 25;
        isProactiveAssistActive = false;
        lowSignalStartTime = null;
        proactiveTriggerCount = 0;
        console.log("[AdaptationContract] Reset.");
    }

    return {
        initialize: initialize,
        stop: stop,
        reset: reset,
        on: on,
        off: off,
        triggerManualProactiveAssist: triggerManualProactiveAssist,
        enableProactiveAssist: enableProactiveAssist,
        disableProactiveAssist: disableProactiveAssist,
        getProactiveAssistStatus: getProactiveAssistStatus
    };

})();


const ReadingIntelligence = (function () {

    var isInitialized = false;
    var documentWordCount = 0;
    var documentLineCount = 0;
    var lineWordCountArray = [];

    function on(eventName, callback) {
        AdaptationContract.on(eventName, callback);
        ReadingStateEngine.on(eventName, callback);
    }

    function off(eventName, callback) {
        AdaptationContract.off(eventName, callback);
        ReadingStateEngine.off(eventName, callback);
    }

    function initialize(options) {
        if (isInitialized) {
            return;
        }

        var safeOptions = options || {};

        ReadingStateEngine.initialize();
        AdaptationContract.initialize();

        if (safeOptions.documentWordCount) {
            setDocumentWordCount(safeOptions.documentWordCount, safeOptions.documentLineCount, safeOptions.lineWordCounts);
        }

        isInitialized = true;
        console.log("[ReadingIntelligence] Initialized.");
    }

    function start() {
        ReadingStateEngine.start();
        console.log("[ReadingIntelligence] Started.");
    }

    function stop() {
        ReadingStateEngine.stop();
        AdaptationContract.stop();
        console.log("[ReadingIntelligence] Stopped.");
    }

    function reset() {
        ReadingStateEngine.reset();
        DifficultyEngine.reset();
        AdaptationContract.reset();
        console.log("[ReadingIntelligence] Reset.");
    }

    function setDocumentWordCount(totalWords, totalLines, perLineWordCounts) {
        documentTotalWords = totalWords || 0;
        documentTotalLines = totalLines || 0;
        lineWordCountArray = perLineWordCounts || [];
        ReadingStateEngine.setDocumentWordCount(documentTotalWords, documentTotalLines, lineWordCountArray);
    }

    function getCurrentState() {
        return DifficultyEngine.getCurrentState();
    }

    function getCurrentMetrics() {
        return ReadingStateEngine.getCurrentMetrics();
    }

    function getCurrentScore() {
        return DifficultyEngine.getCurrentSmoothedScore();
    }

    function triggerProactiveAssist(lineIndex, action) {
        return AdaptationContract.triggerManualProactiveAssist(lineIndex, action);
    }

    function enableProactiveAssist(reason) {
        AdaptationContract.enableProactiveAssist(reason);
    }

    function disableProactiveAssist() {
        AdaptationContract.disableProactiveAssist();
    }

    function isProactiveAssistActive() {
        return AdaptationContract.getProactiveAssistStatus().active;
    }

    return {
        initialize: initialize,
        start: start,
        stop: stop,
        reset: reset,
        on: on,
        off: off,
        setDocumentWordCount: setDocumentWordCount,
        getCurrentState: getCurrentState,
        getCurrentMetrics: getCurrentMetrics,
        getCurrentScore: getCurrentScore,
        triggerProactiveAssist: triggerProactiveAssist,
        enableProactiveAssist: enableProactiveAssist,
        disableProactiveAssist: disableProactiveAssist,
        isProactiveAssistActive: isProactiveAssistActive
    };

})();
if (typeof window !== "undefined") {
  window.AdaptationContract = AdaptationContract;
  window.ReadingIntelligence = ReadingIntelligence;
}
