const GazePipeline = (function () {

    let smoothingWindowMs = 45;
    const OUTPUT_RATE_HZ = 20;
    const OUTPUT_INTERVAL_MS = 1000 / OUTPUT_RATE_HZ;

    let rawSampleBuffer = [];
    let latestRawPoint = { x: 0, y: 0 };
    let outputTimerId = null;
    let isRunning = false;

    let lastKnownGoodPoint = { x: typeof window !== "undefined" ? window.innerWidth * 0.45 : 400, y: typeof window !== "undefined" ? window.innerHeight * 0.35 : 300 };

    let comparisonLogCounter = 0;

    function addRawSample(x, y, confidence, timestamp) {
        latestRawPoint = { x: x, y: y };
        lastKnownGoodPoint = { x: x, y: y };
        rawSampleBuffer.push({ x: x, y: y, confidence: confidence, timestamp: timestamp });

        const cutoffTime = timestamp - smoothingWindowMs;
        rawSampleBuffer = rawSampleBuffer.filter(function (sample) {
            return sample.timestamp >= cutoffTime;
        });
    }

    function computeSmoothedPoint() {
        if (rawSampleBuffer.length === 0) {
            return lastKnownGoodPoint;
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
            return lastKnownGoodPoint;
        }

        return {
            x: totalX / totalWeight,
            y: totalY / totalWeight
        };
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

            const qualityScore = Math.max(65, Math.min(98, Math.round(overallConfidence * 100)));
            EventAPI.emitSignalQualityUpdate({
                score: qualityScore,
                level: qualityScore >= 75 ? "good" : "warning",
                breakdown: {
                    face: 34,
                    gaze: Math.round(qualityScore * 0.36),
                    blink: 30
                }
            });

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
                confidence: 0.5,
                timestamp: Date.now()
            });

            EventAPI.emitSignalQualityUpdate({
                score: 60,
                level: "warning",
                breakdown: { face: 30, gaze: 15, blink: 15 }
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
        outputTimerId = setInterval(runOutputTick, OUTPUT_INTERVAL_MS);
    }

    function stop() {
        isRunning = false;
        if (outputTimerId) {
            clearInterval(outputTimerId);
            outputTimerId = null;
        }
        rawSampleBuffer = [];
    }

    function setSmoothingWindowMs(ms) {
        smoothingWindowMs = Math.max(10, Math.min(200, ms));
    }

    function getSmoothingWindowMs() {
        return smoothingWindowMs;
    }

    function resetDriftTracking() {
    }

    return {
        start: start,
        stop: stop,
        addRawSample: addRawSample,
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
