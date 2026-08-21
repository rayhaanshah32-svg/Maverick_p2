const GazePipeline = (function () {

    let smoothingWindowMs = 45;
    const OUTPUT_RATE_HZ = 20;
    const OUTPUT_INTERVAL_MS = 1000 / OUTPUT_RATE_HZ;

    const RECALIBRATION_DRIFT_THRESHOLD_PX = 130;
    const RECALIBRATION_CHECK_WINDOW_MS = 5000;

    let rawSampleBuffer = [];
    let latestRawPoint = { x: 0, y: 0 };
    let outputTimerId = null;
    let isRunning = false;

    let lastKnownGoodPoint = null;
    let driftCheckSamples = [];

    let comparisonLogCounter = 0;

    function addRawSample(x, y, confidence, timestamp) {
        latestRawPoint = { x: x, y: y };
        rawSampleBuffer.push({ x: x, y: y, confidence: confidence, timestamp: timestamp });

        const cutoffTime = timestamp - smoothingWindowMs;
        rawSampleBuffer = rawSampleBuffer.filter(function (sample) {
            return sample.timestamp >= cutoffTime;
        });
    }

    function computeSmoothedPoint() {
        if (rawSampleBuffer.length === 0) {
            return null;
        }

        let totalX = 0;
        let totalY = 0;
        let totalWeight = 0;

        for (let i = 0; i < rawSampleBuffer.length; i++) {
            const sample = rawSampleBuffer[i];
            const weight = sample.confidence > 0 ? sample.confidence : 0.1;
            totalX += sample.x * weight;
            totalY += sample.y * weight;
            totalWeight += weight;
        }

        if (totalWeight === 0) {
            return null;
        }

        return {
            x: totalX / totalWeight,
            y: totalY / totalWeight
        };
    }

    function checkForDrift(newSmoothedPoint) {
        if (!newSmoothedPoint) {
            return;
        }

        const now = Date.now();
        driftCheckSamples.push({ x: newSmoothedPoint.x, y: newSmoothedPoint.y, timestamp: now });

        const driftWindowStart = now - RECALIBRATION_CHECK_WINDOW_MS;
        driftCheckSamples = driftCheckSamples.filter(function (sample) {
            return sample.timestamp >= driftWindowStart;
        });

        if (driftCheckSamples.length < 12) {
            return;
        }

        let maxDistanceFromFirst = 0;
        const firstSample = driftCheckSamples[0];

        for (let i = 1; i < driftCheckSamples.length; i++) {
            const distance = Math.sqrt(
                Math.pow(driftCheckSamples[i].x - firstSample.x, 2) +
                Math.pow(driftCheckSamples[i].y - firstSample.y, 2)
            );
            if (distance > maxDistanceFromFirst) {
                maxDistanceFromFirst = distance;
            }
        }

        if (maxDistanceFromFirst > RECALIBRATION_DRIFT_THRESHOLD_PX) {
            driftCheckSamples = [];
            EventAPI.emitRecalibrationNeeded("gaze_drift_detected");
        }
    }

    function runOutputTick() {
        const smoothedPoint = computeSmoothedPoint();

        if (smoothedPoint) {
            lastKnownGoodPoint = smoothedPoint;

            const lineMapping = DOMMapper.findLineAtPoint(smoothedPoint.x, smoothedPoint.y);

            const avgConfidence =
                rawSampleBuffer.length > 0
                    ? rawSampleBuffer.reduce(function (sum, s) { return sum + s.confidence; }, 0) /
                    rawSampleBuffer.length
                    : 0;

            const roundedSmoothX = Math.round(smoothedPoint.x);
            const roundedSmoothY = Math.round(smoothedPoint.y);
            const roundedRawX = Math.round(latestRawPoint.x);
            const roundedRawY = Math.round(latestRawPoint.y);

            comparisonLogCounter++;
            if (comparisonLogCounter % 40 === 0) {
                const diffX = Math.abs(roundedRawX - roundedSmoothX);
                const diffY = Math.abs(roundedRawY - roundedSmoothY);
                console.log(
                    "[Signal Smoothing] Raw: (" + roundedRawX + ", " + roundedRawY + ") | " +
                    "Smoothed: (" + roundedSmoothX + ", " + roundedSmoothY + ") | " +
                    "Delta: (" + diffX + "px, " + diffY + "px)"
                );
            }

            DOMMapper.renderDebugOverlay(lineMapping.lineIndex, lineMapping.paragraphIndex);

            EventAPI.emitGazeUpdate({
                x: roundedSmoothX,
                y: roundedSmoothY,
                rawX: roundedRawX,
                rawY: roundedRawY,
                lineIndex: lineMapping.lineIndex,
                localLineIndex: lineMapping.localLineIndex,
                paragraphIndex: lineMapping.paragraphIndex,
                aoi: lineMapping.aoi,
                confidence: parseFloat(avgConfidence.toFixed(3)),
                timestamp: Date.now()
            });
        }
    }

    function handleIncomingWebGazerPoint(gazeData, webgazerElapsedTime) {
        if (!gazeData) {
            return;
        }

        const gateResult = ConfidenceGate.assessSample(gazeData);

        if (!gateResult.allowed) {
            return;
        }

        addRawSample(gazeData.x, gazeData.y, gateResult.confidence, Date.now());
    }

    function start() {
        if (isRunning) {
            return;
        }
        isRunning = true;
        outputTimerId = setInterval(runOutputTick, OUTPUT_INTERVAL_MS);
    }

    function stop() {
        isRunning = false;
        if (outputTimerId) {
            clearInterval(outputTimerId);
            outputTimerId = null;
        }
        rawSampleBuffer = [];
        driftCheckSamples = [];
    }

    function resetDriftTracking() {
        driftCheckSamples = [];
    }

    function setSmoothingWindowMs(newMs) {
        if (newMs >= 10 && newMs <= 250) {
            smoothingWindowMs = newMs;
            console.log("[GazePipeline] Smoothing window updated to " + newMs + "ms");
        }
    }

    function getSmoothingWindowMs() {
        return smoothingWindowMs;
    }

    return {
        handleIncomingWebGazerPoint: handleIncomingWebGazerPoint,
        start: start,
        stop: stop,
        resetDriftTracking: resetDriftTracking,
        setSmoothingWindowMs: setSmoothingWindowMs,
        getSmoothingWindowMs: getSmoothingWindowMs,
        OUTPUT_RATE_HZ: OUTPUT_RATE_HZ
    };

})();
