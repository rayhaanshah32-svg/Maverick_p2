const GazePipeline = (function () {

    const SMOOTHING_WINDOW_MS = 40;
    const OUTPUT_RATE_HZ = 20;
    const OUTPUT_INTERVAL_MS = 1000 / OUTPUT_RATE_HZ;

    const RECALIBRATION_DRIFT_THRESHOLD_PX = 120;
    const RECALIBRATION_CHECK_WINDOW_MS = 5000;

    let rawSampleBuffer = [];
    let smoothedOutputBuffer = [];
    let outputTimerId = null;
    let isRunning = false;

    let lastKnownGoodPoint = null;
    let driftCheckSamples = [];

    function addRawSample(x, y, confidence, timestamp) {
        rawSampleBuffer.push({ x: x, y: y, confidence: confidence, timestamp: timestamp });

        const cutoffTime = timestamp - SMOOTHING_WINDOW_MS;
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

        if (driftCheckSamples.length < 10) {
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
            checkForDrift(smoothedPoint);

            const lineMapping = DOMMapper.findLineAtPoint(smoothedPoint.x, smoothedPoint.y);
            const quality = MediaPipeEngine.getLastQualityData();

            const avgConfidence =
                rawSampleBuffer.length > 0
                    ? rawSampleBuffer.reduce(function (sum, s) { return sum + s.confidence; }, 0) /
                    rawSampleBuffer.length
                    : 0;

            EventAPI.emitGazeUpdate({
                x: Math.round(smoothedPoint.x),
                y: Math.round(smoothedPoint.y),
                lineIndex: lineMapping.lineIndex,
                localLineIndex: lineMapping.localLineIndex,
                paragraphIndex: lineMapping.paragraphIndex,
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

    function getSmoothedOutputBuffer() {
        return smoothedOutputBuffer.slice();
    }

    return {
        handleIncomingWebGazerPoint: handleIncomingWebGazerPoint,
        start: start,
        stop: stop,
        resetDriftTracking: resetDriftTracking,
        getSmoothedOutputBuffer: getSmoothedOutputBuffer,
        OUTPUT_RATE_HZ: OUTPUT_RATE_HZ
    };

})();
