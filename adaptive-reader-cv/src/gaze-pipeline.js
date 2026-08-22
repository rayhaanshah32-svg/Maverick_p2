const GazePipeline = (function () {

    let smoothingWindowMs = 45;
    const OUTPUT_RATE_HZ = 20;
    const OUTPUT_INTERVAL_MS = 1000 / OUTPUT_RATE_HZ;

    const RECALIBRATION_DRIFT_THRESHOLD_PX = 300;
    const RECALIBRATION_CHECK_WINDOW_MS = 8000;

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

        for (let i = 0; i < rawSampleBuffer.length; i = i + 1) {
            const sample = rawSampleBuffer[i];
            const weight = sample.confidence > 0 ? sample.confidence : 0.1;
            totalX = totalX + (sample.x * weight);
            totalY = totalY + (sample.y * weight);
            totalWeight = totalWeight + weight;
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

        for (let i = 1; i < driftCheckSamples.length; i = i + 1) {
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

            const qualityEvaluation = ConfidenceGate.assessSample(latestRawPoint);
            const overallConfidence = qualityEvaluation.allowed
                ? qualityEvaluation.confidence
                : 0;

            EventAPI.emitGazeUpdate({
                x: smoothedPoint.x,
                y: smoothedPoint.y,
                rawX: latestRawPoint.x,
                rawY: latestRawPoint.y,
                lineIndex: lineMapping.lineIndex,
                localLineIndex: lineMapping.localLineIndex,
                paragraphIndex: lineMapping.paragraphIndex,
                aoi: lineMapping.aoi,
                confidence: overallConfidence,
                timestamp: Date.now()
            });

            checkForDrift(smoothedPoint);

            comparisonLogCounter = comparisonLogCounter + 1;
            if (comparisonLogCounter % 40 === 0) {
                const diffX = Math.round(smoothedPoint.x - latestRawPoint.x);
                const diffY = Math.round(smoothedPoint.y - latestRawPoint.y);
            }
        } else if (lastKnownGoodPoint) {
            const lineMappingFallback = DOMMapper.findLineAtPoint(
                lastKnownGoodPoint.x,
                lastKnownGoodPoint.y
            );

            EventAPI.emitGazeUpdate({
                x: lastKnownGoodPoint.x,
                y: lastKnownGoodPoint.y,
                rawX: latestRawPoint.x,
                rawY: latestRawPoint.y,
                lineIndex: lineMappingFallback.lineIndex,
                localLineIndex: lineMappingFallback.localLineIndex,
                paragraphIndex: lineMappingFallback.paragraphIndex,
                aoi: lineMappingFallback.aoi,
                confidence: 0.2,
                timestamp: Date.now()
            });
        }
    }

    function handleIncomingWebGazerPoint(gazeData, elapsedTime) {
        if (!gazeData || !isRunning) {
            return;
        }

        const x = gazeData.x;
        const y = gazeData.y;
        const timestamp = Date.now();

        const isReasonable = x >= -100 && x <= window.innerWidth + 100 &&
                             y >= -100 && y <= window.innerHeight + 100;

        const confidence = isReasonable ? 0.85 : 0.2;
        addRawSample(x, y, confidence, timestamp);
    }

    function start() {
        if (isRunning) {
            return;
        }
        isRunning = true;
        rawSampleBuffer = [];
        driftCheckSamples = [];

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

    function setSmoothingWindowMs(ms) {
        smoothingWindowMs = Math.max(10, Math.min(200, ms));
    }

    function getSmoothingWindowMs() {
        return smoothingWindowMs;
    }

    function resetDriftTracking() {
        driftCheckSamples = [];
    }

    return {
        start: start,
        stop: stop,
        handleIncomingWebGazerPoint: handleIncomingWebGazerPoint,
        setSmoothingWindowMs: setSmoothingWindowMs,
        getSmoothingWindowMs: getSmoothingWindowMs,
        resetDriftTracking: resetDriftTracking,
        OUTPUT_RATE_HZ: OUTPUT_RATE_HZ
    };

})();

if (typeof window !== "undefined") {
    window.GazePipeline = GazePipeline;
}
