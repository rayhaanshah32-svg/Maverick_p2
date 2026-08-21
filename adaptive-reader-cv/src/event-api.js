const EventAPI = (function () {

    const listeners = {
        onGazeUpdate: [],
        onCalibrationComplete: [],
        onFaceQualityChange: [],
        onRecalibrationNeeded: [],
        onBaselineComplete: [],
        onCalibrationProgress: [],
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
            lineIndex: gazeObject.lineIndex,
            localLineIndex: gazeObject.localLineIndex,
            paragraphIndex: gazeObject.paragraphIndex,
            confidence: gazeObject.confidence,
            timestamp: gazeObject.timestamp || Date.now()
        });
    }

    function emitCalibrationComplete(accuracyScore) {
        emit("onCalibrationComplete", {
            accuracyScore: accuracyScore,
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
            wordsPerMinute: baselineObject.wordsPerMinute,
            averageFixationDuration: baselineObject.averageFixationDuration,
            blinkRate: baselineObject.blinkRate,
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
        emitFaceQualityChange: emitFaceQualityChange,
        emitRecalibrationNeeded: emitRecalibrationNeeded,
        emitBaselineComplete: emitBaselineComplete,
        emitCalibrationProgress: emitCalibrationProgress,
        emitSystemReady: emitSystemReady
    };

})();
