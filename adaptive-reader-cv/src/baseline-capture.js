const BaselineCapture = (function () {

    const BASELINE_DURATION_MS = 45000;
    const FIXATION_THRESHOLD_PX = 35;
    const FIXATION_MIN_DURATION_MS = 80;
    const BLINK_STATE_SAMPLE_INTERVAL_MS = 200;

    let isRunning = false;
    let startTime = null;
    let collectedGazeSamples = [];
    let blinkCount = 0;
    let blinkCheckTimer = null;
    let lastBlinkState = false;
    let gazeUpdateListener = null;

    function startBaseline() {
        if (isRunning) {
            return;
        }

        isRunning = true;
        startTime = Date.now();
        collectedGazeSamples = [];
        blinkCount = 0;
        lastBlinkState = false;

        gazeUpdateListener = function (gazeData) {
            if (isRunning) {
                collectedGazeSamples.push({
                    x: gazeData.x,
                    y: gazeData.y,
                    timestamp: gazeData.timestamp,
                    lineIndex: gazeData.lineIndex
                });
            }
        };

        EventAPI.on("onGazeUpdate", gazeUpdateListener);

        blinkCheckTimer = setInterval(function () {
            const quality = MediaPipeEngine.getLastQualityData();
            const currentBlinkState = quality.blinkState;

            if (currentBlinkState && !lastBlinkState) {
                blinkCount++;
            }
            lastBlinkState = currentBlinkState;
        }, BLINK_STATE_SAMPLE_INTERVAL_MS);

        setTimeout(function () {
            finishBaseline();
        }, BASELINE_DURATION_MS);
    }

    function computeFixations(samples) {
        if (samples.length < 2) {
            return [];
        }

        const fixations = [];
        let fixationStartIndex = 0;

        for (let i = 1; i < samples.length; i++) {
            const distanceFromStart = Math.sqrt(
                Math.pow(samples[i].x - samples[fixationStartIndex].x, 2) +
                Math.pow(samples[i].y - samples[fixationStartIndex].y, 2)
            );

            const isLastSample = i === samples.length - 1;

            if (distanceFromStart > FIXATION_THRESHOLD_PX || isLastSample) {
                const fixationDuration =
                    samples[i - 1].timestamp - samples[fixationStartIndex].timestamp;

                if (fixationDuration >= FIXATION_MIN_DURATION_MS) {
                    fixations.push({
                        duration: fixationDuration,
                        x: samples[fixationStartIndex].x,
                        y: samples[fixationStartIndex].y,
                        lineIndex: samples[fixationStartIndex].lineIndex
                    });
                }

                fixationStartIndex = i;
            }
        }

        return fixations;
    }

    function computeWordsPerMinute(fixations, totalLinesRead) {
        const AVERAGE_WORDS_PER_LINE = 10;
        const durationMinutes = BASELINE_DURATION_MS / 60000;

        const estimatedWords = totalLinesRead * AVERAGE_WORDS_PER_LINE;
        const wordsPerMinute = estimatedWords / durationMinutes;

        return Math.round(wordsPerMinute);
    }

    function finishBaseline() {
        isRunning = false;

        if (blinkCheckTimer) {
            clearInterval(blinkCheckTimer);
            blinkCheckTimer = null;
        }

        if (gazeUpdateListener) {
            EventAPI.off("onGazeUpdate", gazeUpdateListener);
            gazeUpdateListener = null;
        }

        const fixations = computeFixations(collectedGazeSamples);

        let averageFixationDuration = 0;
        if (fixations.length > 0) {
            const totalFixationTime = fixations.reduce(function (sum, fixation) {
                return sum + fixation.duration;
            }, 0);
            averageFixationDuration = Math.round(totalFixationTime / fixations.length);
        }

        const visitedLines = new Set();
        for (let i = 0; i < collectedGazeSamples.length; i++) {
            if (collectedGazeSamples[i].lineIndex >= 0) {
                visitedLines.add(collectedGazeSamples[i].lineIndex);
            }
        }
        const totalLinesRead = visitedLines.size;

        const wordsPerMinute = computeWordsPerMinute(fixations, totalLinesRead);

        const durationSeconds = BASELINE_DURATION_MS / 1000;
        const blinkRate = parseFloat(((blinkCount / durationSeconds) * 60).toFixed(1));

        const baselineResult = {
            wordsPerMinute: wordsPerMinute,
            averageFixationDuration: averageFixationDuration,
            blinkRate: blinkRate,
            totalFixations: fixations.length,
            totalLinesRead: totalLinesRead,
            durationSeconds: durationSeconds
        };

        EventAPI.emitBaselineComplete(baselineResult);
    }

    function stopBaseline() {
        if (!isRunning) {
            return;
        }
        finishBaseline();
    }

    return {
        startBaseline: startBaseline,
        stopBaseline: stopBaseline
    };

})();
