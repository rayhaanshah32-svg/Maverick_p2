const EventAPI = (function () {

    const listeners = {
        onGazeUpdate: [],
        onCalibrationComplete: [],
        onFaceQualityChange: [],
        onRecalibrationNeeded: [],
        onBaselineComplete: [],
        onCalibrationProgress: [],
        onSignalQualityUpdate: [],
        onCalibrationQualityLive: [],
        onSystemReady: []
    };

    function on(eventName, callback) {
        if (!listeners[eventName]) {
            console.warn("EventAPI: Unknown event name:", eventName);
            return;
        }
        listeners[eventName].push(callback);
    }

    function off(eventName, callback) {
        if (!listeners[eventName]) {
            return;
        }
        listeners[eventName] = listeners[eventName].filter(function (item) {
            return item !== callback;
        });
    }

    function emit(eventName, data) {
        if (!listeners[eventName]) {
            return;
        }
        for (let i = 0; i < listeners[eventName].length; i++) {
            try {
                listeners[eventName][i](data);
            } catch (error) {
                console.error("EventAPI: Error in listener for", eventName, error);
            }
        }
    }

    function emitGazeUpdate(gazeObject) {
        emit("onGazeUpdate", {
            x: gazeObject.x,
            y: gazeObject.y,
            rawX: gazeObject.rawX,
            rawY: gazeObject.rawY,
            lineIndex: gazeObject.lineIndex,
            localLineIndex: gazeObject.localLineIndex,
            paragraphIndex: gazeObject.paragraphIndex,
            aoi: gazeObject.aoi || null,
            confidence: gazeObject.confidence,
            timestamp: gazeObject.timestamp || Date.now()
        });
    }

    function emitCalibrationComplete(accuracyScore, mode) {
        emit("onCalibrationComplete", {
            accuracyScore: accuracyScore,
            mode: mode || "full",
            timestamp: Date.now()
        });
    }

    function emitCalibrationQualityLive(qualityData) {
        emit("onCalibrationQualityLive", {
            currentPoint: qualityData.currentPoint,
            totalPoints: qualityData.totalPoints,
            pointAccuracy: qualityData.pointAccuracy,
            overallAccuracy: qualityData.overallAccuracy,
            phase: qualityData.phase,
            mode: qualityData.mode
        });
    }

    function emitSignalQualityUpdate(qualityData) {
        emit("onSignalQualityUpdate", {
            score: qualityData.score,
            level: qualityData.level,
            breakdown: qualityData.breakdown,
            timestamp: Date.now()
        });
    }

    function emitFaceQualityChange(qualityObject) {
        emit("onFaceQualityChange", {
            facePresent: qualityObject.facePresent,
            headPose: qualityObject.headPose,
            blinkState: qualityObject.blinkState,
            timestamp: Date.now()
        });
    }

    function emitRecalibrationNeeded(reason) {
        emit("onRecalibrationNeeded", {
            reason: reason,
            timestamp: Date.now()
        });
    }

    function emitBaselineComplete(baselineObject) {
        emit("onBaselineComplete", {
            baselineWPM: baselineObject.baselineWPM || baselineObject.wordsPerMinute,
            baselineFixationMs: baselineObject.baselineFixationMs || baselineObject.averageFixationDuration,
            baselineBlinkRate: baselineObject.baselineBlinkRate || baselineObject.blinkRate,
            wordsPerMinute: baselineObject.wordsPerMinute || baselineObject.baselineWPM,
            averageFixationDuration: baselineObject.averageFixationDuration || baselineObject.baselineFixationMs,
            blinkRate: baselineObject.blinkRate || baselineObject.baselineBlinkRate,
            durationSeconds: baselineObject.durationSeconds,
            totalFixations: baselineObject.totalFixations,
            wordsRead: baselineObject.wordsRead,
            timestamp: Date.now()
        });
    }

    function emitCalibrationProgress(progressObject) {
        emit("onCalibrationProgress", {
            currentPoint: progressObject.currentPoint,
            totalPoints: progressObject.totalPoints,
            phase: progressObject.phase
        });
    }

    function emitSystemReady() {
        emit("onSystemReady", { timestamp: Date.now() });
    }

    return {
        on: on,
        off: off,
        emitGazeUpdate: emitGazeUpdate,
        emitCalibrationComplete: emitCalibrationComplete,
        emitCalibrationQualityLive: emitCalibrationQualityLive,
        emitSignalQualityUpdate: emitSignalQualityUpdate,
        emitFaceQualityChange: emitFaceQualityChange,
        emitRecalibrationNeeded: emitRecalibrationNeeded,
        emitBaselineComplete: emitBaselineComplete,
        emitCalibrationProgress: emitCalibrationProgress,
        emitSystemReady: emitSystemReady
    };

})();
if (typeof window !== "undefined") {
  window.EventAPI = EventAPI;
}
