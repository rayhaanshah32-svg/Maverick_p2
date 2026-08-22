const ReadingStateEngine = (function () {

    var GAZE_BUFFER_MS = 8000;
    var MIN_CONFIDENCE = 0.45;
    var MIN_QUALITY_SCORE = 45;
    var FIXATION_MIN_MS = 120;
    var FIXATION_DISPERSION_PX = 60;
    var REGRESSION_MIN_LINE_DIFF = 1;
    var REGRESSION_PERSIST_MS = 180;
    var PAUSE_MIN_MS = 1200;
    var PAUSE_END_GRACE_MS = 300;
    var TICK_INTERVAL_MS = 1000;
    var WPM_WINDOW_MS = 30000;
    var LINE_SEQUENCE_MAX_LENGTH = 30;
    var RECENT_REGRESSION_WINDOW_MS = 30000;
    var RECENT_FIXATION_WINDOW_MS = 15000;
    var MAX_HISTORY_LENGTH = 200;

    var gazeBuffer = [];
    var lineSequence = [];
    var lineStats = {};
    var fixationHistory = [];
    var regressionHistory = [];

    var currentFixationCandidate = null;
    var lastConfirmedLineIndex = -1;
    var currentActiveLine = -1;
    var pendingRegressionTarget = null;
    var pendingRegressionStartedAt = null;

    var pauseStartTime = null;
    var pauseIsActive = false;
    var pauseCount = 0;
    var longestPauseMs = 0;

    var totalRegressions = 0;
    var totalRevisits = 0;
    var totalReReads = 0;

    var currentSignalQuality = 0;
    var signalIsUsable = false;
    var lastFacePresent = false;
    var lastBlinkState = false;

    var baselineWPM = 220;
    var baselineFixationMs = 240;
    var baselineBlinkRate = 15;
    var baselineReady = false;

    var documentTotalWords = 0;
    var documentTotalLines = 0;
    var lineWordCounts = [];

    var wpmWindowSamples = [];

    var tickTimerId = null;
    var isRunning = false;
    var isInitialized = false;

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
        if (listeners && listeners.length > 0) {
            for (var i = 0; i < listeners.length; i++) {
                try {
                    listeners[i](data);
                } catch (error) {
                    console.error(error);
                }
            }
        }
        if (window.EventAPI && window.EventAPI.emit) {
            window.EventAPI.emit(eventName, data);
        }
    }

    function isSignalUsableNow(sampleConfidence) {
        if (sampleConfidence !== undefined && sampleConfidence > 0.1) {
            return true;
        }
        if (currentSignalQuality >= 30) {
            return true;
        }
        if (lastFacePresent) {
            return true;
        }
        return false;
    }

    function pushToGazeBuffer(sample) {
        gazeBuffer.push(sample);
        var cutoffTime = sample.timestamp - GAZE_BUFFER_MS;
        while (gazeBuffer.length > 0 && gazeBuffer[0].timestamp < cutoffTime) {
            gazeBuffer.shift();
        }
    }

    function trimHistoryIfNeeded(historyArray) {
        if (historyArray.length > MAX_HISTORY_LENGTH) {
            historyArray.splice(0, historyArray.length - MAX_HISTORY_LENGTH);
        }
    }

    function getWordsOnLine(lineIndex) {
        if (lineWordCounts.length > 0 && lineIndex >= 0 && lineIndex < lineWordCounts.length) {
            return lineWordCounts[lineIndex];
        }
        if (documentTotalLines > 0 && documentTotalWords > 0) {
            return Math.round(documentTotalWords / documentTotalLines);
        }
        return 8;
    }

    function ensureLineStats(lineIndex) {
        if (!lineStats[lineIndex]) {
            lineStats[lineIndex] = {
                lineIndex: lineIndex,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                dwellMs: 0,
                fixationMs: 0,
                visitCount: 0,
                revisitCount: 0,
                regressionEntries: 0
            };
        }
    }

    function recordLineEntry(lineIndex, timestamp) {
        ensureLineStats(lineIndex);
        var stats = lineStats[lineIndex];
        if (stats.visitCount === 0) {
            stats.firstSeen = timestamp;
            stats.visitCount = 1;
        } else {
            stats.revisitCount++;
        }
        stats.lastSeen = timestamp;
    }

    function updateLineDwell(lineIndex, timestamp) {
        var stats = lineStats[lineIndex];
        if (!stats) {
            return;
        }
        stats.lastSeen = timestamp;
        stats.dwellMs = stats.lastSeen - stats.firstSeen;
    }

    function checkForFixation(newSample) {
        if (!currentFixationCandidate) {
            currentFixationCandidate = {
                startTime: newSample.timestamp,
                startX: newSample.x,
                startY: newSample.y,
                lineIndex: newSample.lineIndex,
                paragraphIndex: newSample.paragraphIndex,
                samples: [newSample]
            };
            return;
        }

        var candidate = currentFixationCandidate;
        var distFromStart = Math.sqrt(
            Math.pow(newSample.x - candidate.startX, 2) +
            Math.pow(newSample.y - candidate.startY, 2)
        );

        if (distFromStart > FIXATION_DISPERSION_PX) {
            var durationMs = newSample.timestamp - candidate.startTime;
            if (durationMs >= FIXATION_MIN_MS && candidate.lineIndex >= 0) {
                var avgConfidence = 0;
                for (var i = 0; i < candidate.samples.length; i++) {
                    avgConfidence += candidate.samples[i].confidence;
                }
                avgConfidence = avgConfidence / candidate.samples.length;

                var fixation = {
                    startTime: candidate.startTime,
                    endTime: newSample.timestamp,
                    durationMs: durationMs,
                    x: candidate.startX,
                    y: candidate.startY,
                    lineIndex: candidate.lineIndex,
                    paragraphIndex: candidate.paragraphIndex,
                    confidence: parseFloat(avgConfidence.toFixed(3))
                };

                fixationHistory.push(fixation);
                trimHistoryIfNeeded(fixationHistory);

                var stats = lineStats[candidate.lineIndex];
                if (stats) {
                    stats.fixationMs += durationMs;
                }

                emit("onFixationDetected", fixation);
            }

            currentFixationCandidate = {
                startTime: newSample.timestamp,
                startX: newSample.x,
                startY: newSample.y,
                lineIndex: newSample.lineIndex,
                paragraphIndex: newSample.paragraphIndex,
                samples: [newSample]
            };
        } else {
            candidate.samples.push(newSample);
        }
    }

    function checkForRevisit(lineIndex) {
        var seenHigherAfterThisLine = false;
        var seenThisLineBefore = false;

        var recentLines = lineSequence.slice(-12);
        for (var i = 0; i < recentLines.length - 1; i++) {
            if (recentLines[i].lineIndex === lineIndex) {
                seenThisLineBefore = true;
            }
            if (seenThisLineBefore && recentLines[i].lineIndex > lineIndex) {
                seenHigherAfterThisLine = true;
            }
        }

        if (seenThisLineBefore) {
            totalRevisits++;
        }
        if (seenThisLineBefore && seenHigherAfterThisLine) {
            totalReReads++;
        }
    }

    function confirmRegression(fromLine, toLine, timestamp) {
        totalRegressions++;

        var entry = {
            fromLine: fromLine,
            toLine: toLine,
            timestamp: timestamp
        };
        regressionHistory.push(entry);
        trimHistoryIfNeeded(regressionHistory);

        ensureLineStats(toLine);
        lineStats[toLine].regressionEntries++;

        emit("onRegressionDetected", {
            fromLine: fromLine,
            toLine: toLine,
            totalRegressions: totalRegressions,
            timestamp: timestamp
        });

        checkForRevisit(toLine);
    }

    function processLineTransition(newLineIndex, timestamp) {
        if (newLineIndex < 0) {
            pendingRegressionTarget = null;
            pendingRegressionStartedAt = null;
            return;
        }

        if (lastConfirmedLineIndex < 0) {
            lastConfirmedLineIndex = newLineIndex;
            return;
        }

        var lineDiff = lastConfirmedLineIndex - newLineIndex;
        var isBackward = lineDiff >= REGRESSION_MIN_LINE_DIFF;

        if (!isBackward) {
            pendingRegressionTarget = null;
            pendingRegressionStartedAt = null;
            lastConfirmedLineIndex = newLineIndex;
            return;
        }

        if (pendingRegressionTarget !== newLineIndex) {
            pendingRegressionTarget = newLineIndex;
            pendingRegressionStartedAt = timestamp;
            return;
        }

        var persistedMs = timestamp - pendingRegressionStartedAt;
        if (persistedMs >= REGRESSION_PERSIST_MS) {
            var fromLine = lastConfirmedLineIndex;
            lastConfirmedLineIndex = newLineIndex;
            pendingRegressionTarget = null;
            pendingRegressionStartedAt = null;
            confirmRegression(fromLine, newLineIndex, timestamp);
        }
    }

    function updateLineSequence(lineIndex, timestamp) {
        if (lineIndex < 0) {
            return;
        }
        var lastEntry = lineSequence.length > 0 ? lineSequence[lineSequence.length - 1] : null;
        if (lastEntry && lastEntry.lineIndex === lineIndex) {
            lastEntry.lastSeen = timestamp;
            return;
        }
        lineSequence.push({
            lineIndex: lineIndex,
            enteredAt: timestamp,
            lastSeen: timestamp
        });
        if (lineSequence.length > LINE_SEQUENCE_MAX_LENGTH) {
            lineSequence.shift();
        }
    }

    function managePause(lineIndex, timestamp) {
        if (lineIndex < 0) {
            if (pauseIsActive) {
                pauseIsActive = false;
                pauseStartTime = null;
            }
            return;
        }

        var lastEntry = lineSequence.length > 0 ? lineSequence[lineSequence.length - 1] : null;
        var stillOnSameLine = lastEntry && lastEntry.lineIndex === lineIndex;

        if (!stillOnSameLine) {
            if (pauseIsActive) {
                var endedPauseMs = timestamp - pauseStartTime;
                if (endedPauseMs >= PAUSE_MIN_MS) {
                    pauseCount++;
                    if (endedPauseMs > longestPauseMs) {
                        longestPauseMs = endedPauseMs;
                    }
                }
                pauseIsActive = false;
                pauseStartTime = null;
            }
            return;
        }

        if (!pauseIsActive) {
            pauseStartTime = timestamp;
            pauseIsActive = true;
        }
    }

    function recordWPMSample(lineIndex, timestamp) {
        if (lineIndex < 0) {
            return;
        }

        var cutoffTime = timestamp - WPM_WINDOW_MS;
        while (wpmWindowSamples.length > 0 && wpmWindowSamples[0].timestamp < cutoffTime) {
            wpmWindowSamples.shift();
        }

        for (var i = 0; i < wpmWindowSamples.length; i++) {
            if (wpmWindowSamples[i].lineIndex === lineIndex) {
                return;
            }
        }

        wpmWindowSamples.push({ lineIndex: lineIndex, timestamp: timestamp });
    }

    function estimateCurrentWPM() {
        if (wpmWindowSamples.length < 2) {
            return 0;
        }

        var forwardLines = [];
        var maxLineSeenSoFar = -1;
        for (var i = 0; i < wpmWindowSamples.length; i++) {
            if (wpmWindowSamples[i].lineIndex > maxLineSeenSoFar) {
                forwardLines.push(wpmWindowSamples[i]);
                maxLineSeenSoFar = wpmWindowSamples[i].lineIndex;
            }
        }

        if (forwardLines.length < 2) {
            return 0;
        }

        var totalWords = 0;
        for (var j = 0; j < forwardLines.length; j++) {
            totalWords += getWordsOnLine(forwardLines[j].lineIndex);
        }

        var firstTime = forwardLines[0].timestamp;
        var lastTime = forwardLines[forwardLines.length - 1].timestamp;
        var durationMinutes = (lastTime - firstTime) / 60000;

        if (durationMinutes < 0.005) {
            return 0;
        }

        var wpm = Math.round(totalWords / durationMinutes);
        return Math.max(0, Math.min(600, wpm));
    }

    function computeRecentRegressionRate() {
        var now = Date.now();
        var cutoffTime = now - RECENT_REGRESSION_WINDOW_MS;
        var count = 0;
        for (var i = 0; i < regressionHistory.length; i++) {
            if (regressionHistory[i].timestamp >= cutoffTime) {
                count++;
            }
        }
        var windowMinutes = RECENT_REGRESSION_WINDOW_MS / 60000;
        return count / windowMinutes;
    }

    function computeRecentFixationMedianMs() {
        var now = Date.now();
        var cutoffTime = now - RECENT_FIXATION_WINDOW_MS;
        var durations = [];
        for (var i = 0; i < fixationHistory.length; i++) {
            if (fixationHistory[i].endTime >= cutoffTime) {
                durations.push(fixationHistory[i].durationMs);
            }
        }

        if (durations.length === 0) {
            return 0;
        }

        durations.sort(function (a, b) { return a - b; });
        var midIndex = Math.floor(durations.length / 2);
        if (durations.length % 2 === 0) {
            return Math.round((durations[midIndex - 1] + durations[midIndex]) / 2);
        }
        return durations[midIndex];
    }

    function countRecentRegressions() {
        var now = Date.now();
        var cutoffTime = now - RECENT_REGRESSION_WINDOW_MS;
        var count = 0;
        for (var i = 0; i < regressionHistory.length; i++) {
            if (regressionHistory[i].timestamp >= cutoffTime) {
                count++;
            }
        }
        return count;
    }

    function computeLineTransitionInstability() {
        if (lineSequence.length < 4) {
            return 0;
        }
        var recent = lineSequence.slice(-10);
        var backwardMoves = 0;
        var totalMoves = 0;
        for (var i = 1; i < recent.length; i++) {
            totalMoves++;
            if (recent[i].lineIndex < recent[i - 1].lineIndex) {
                backwardMoves++;
            }
        }
        if (totalMoves === 0) {
            return 0;
        }
        return backwardMoves / totalMoves;
    }

    function computeCurrentPauseMs() {
        if (!pauseIsActive || !pauseStartTime) {
            return 0;
        }
        var elapsed = Date.now() - pauseStartTime;
        return elapsed >= PAUSE_MIN_MS ? elapsed : 0;
    }

    function getCurrentMetrics() {
        var currentWPM = estimateCurrentWPM();
        var recentMedianFixationMs = computeRecentFixationMedianMs();
        var recentRegressionCount = countRecentRegressions();
        var regressionRate = computeRecentRegressionRate();
        var lineTransitionInstability = computeLineTransitionInstability();
        var currentPauseMs = computeCurrentPauseMs();

        var recentFixationCount = 0;
        var now = Date.now();
        var fixationCutoff = now - RECENT_FIXATION_WINDOW_MS;
        for (var i = 0; i < fixationHistory.length; i++) {
            if (fixationHistory[i].endTime >= fixationCutoff) {
                recentFixationCount++;
            }
        }

        return {
            currentLine: currentActiveLine,
            currentParagraph: -1,
            signalQuality: currentSignalQuality,
            signalIsUsable: signalIsUsable,
            fixations: {
                recentCount: recentFixationCount,
                recentMedianMs: recentMedianFixationMs,
                totalCount: fixationHistory.length
            },
            regressions: {
                total: totalRegressions,
                recentCount: recentRegressionCount,
                regressionRate: regressionRate,
                lastTimestamp: regressionHistory.length > 0 ? regressionHistory[regressionHistory.length - 1].timestamp : null
            },
            revisits: {
                revisitCount: totalRevisits,
                reReadCount: totalReReads
            },
            pause: {
                pauseCount: pauseCount,
                longestMs: longestPauseMs,
                currentMs: currentPauseMs
            },
            wpm: {
                currentWPM: currentWPM,
                baselineWPM: baselineWPM,
                speedRatio: baselineWPM > 0 ? currentWPM / baselineWPM : 1
            },
            baseline: {
                baselineWPM: baselineWPM,
                baselineFixationMs: baselineFixationMs,
                baselineBlinkRate: baselineBlinkRate,
                baselineReady: baselineReady
            },
            lineTransitionInstability: lineTransitionInstability,
            lineStats: lineStats
        };
    }

    function handleGazeUpdate(gazeData) {
        if (!isRunning) {
            return;
        }

        var confidence = gazeData.confidence || 0.85;
        var usable = isSignalUsableNow(confidence);
        signalIsUsable = usable;

        if (!usable) {
            if (currentActiveLine >= 0 && pauseIsActive) {
                pauseIsActive = false;
                pauseStartTime = null;
            }
            return;
        }

        var timestamp = gazeData.timestamp || Date.now();
        var lineIndex = gazeData.lineIndex;

        var sample = {
            x: gazeData.x,
            y: gazeData.y,
            lineIndex: lineIndex,
            paragraphIndex: gazeData.paragraphIndex,
            confidence: confidence,
            timestamp: timestamp
        };

        pushToGazeBuffer(sample);
        checkForFixation(sample);

        if (lineIndex < 0) {
            currentActiveLine = -1;
            managePause(-1, timestamp);
            return;
        }

        ensureLineStats(lineIndex);
        updateLineDwell(lineIndex, timestamp);

        var lineChanged = lineIndex !== currentActiveLine;

        if (lineChanged) {
            managePause(lineIndex, timestamp);
            updateLineSequence(lineIndex, timestamp);
            recordLineEntry(lineIndex, timestamp);
            processLineTransition(lineIndex, timestamp);
            recordWPMSample(lineIndex, timestamp);
            currentActiveLine = lineIndex;
        } else {
            managePause(lineIndex, timestamp);
            if (pendingRegressionTarget !== null) {
                processLineTransition(lineIndex, timestamp);
            }
        }
    }

    function handleSignalQualityUpdate(qualityData) {
        currentSignalQuality = qualityData.score || 0;
    }

    function handleFaceQualityChange(faceData) {
        lastFacePresent = faceData.facePresent;
        lastBlinkState = faceData.blinkState;

        if (!faceData.facePresent) {
            signalIsUsable = false;
            pendingRegressionTarget = null;
            pendingRegressionStartedAt = null;
            if (pauseIsActive) {
                pauseIsActive = false;
                pauseStartTime = null;
            }
        }
    }

    function handleBaselineComplete(baselineData) {
        baselineWPM = baselineData.baselineWPM || 220;
        baselineFixationMs = baselineData.baselineFixationMs || 240;
        baselineBlinkRate = baselineData.baselineBlinkRate || 15;
        baselineReady = true;
        console.log("[ReadingStateEngine] Baseline received:", baselineWPM, "WPM,", baselineFixationMs, "ms fixation");
    }

    function runScoringTick() {
        if (!isRunning) {
            return;
        }
        emit("onMetricsReady", getCurrentMetrics());
    }

    function setDocumentWordCount(totalWords, totalLines, perLineWordCounts) {
        documentTotalWords = totalWords || 0;
        documentTotalLines = totalLines || 0;
        lineWordCounts = perLineWordCounts || [];
    }

    function initialize(options) {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        var api = (window.EventAPI) ? window.EventAPI : (window.AdaptiveReaderCV || null);

        if (api) {
            api.on("onGazeUpdate", handleGazeUpdate);
            api.on("onSignalQualityUpdate", handleSignalQualityUpdate);
            api.on("onFaceQualityChange", handleFaceQualityChange);
            api.on("onBaselineComplete", handleBaselineComplete);
        }

        if (options && options.documentWordCount) {
            documentTotalWords = options.documentWordCount;
        }
        if (options && options.documentLineCount) {
            documentTotalLines = options.documentLineCount;
        }

        lastFacePresent = true;
        currentSignalQuality = MIN_QUALITY_SCORE;

        console.log("[ReadingStateEngine] Initialized.");
    }

    function start() {
        if (isRunning) {
            return;
        }
        isRunning = true;
        tickTimerId = setInterval(runScoringTick, TICK_INTERVAL_MS);
        console.log("[ReadingStateEngine] Started.");
    }

    function stop() {
        isRunning = false;
        if (tickTimerId) {
            clearInterval(tickTimerId);
            tickTimerId = null;
        }
        console.log("[ReadingStateEngine] Stopped.");
    }

    function reset() {
        gazeBuffer = [];
        lineSequence = [];
        lineStats = {};
        fixationHistory = [];
        regressionHistory = [];
        currentFixationCandidate = null;
        lastConfirmedLineIndex = -1;
        currentActiveLine = -1;
        pendingRegressionTarget = null;
        pendingRegressionStartedAt = null;
        pauseStartTime = null;
        pauseIsActive = false;
        pauseCount = 0;
        longestPauseMs = 0;
        totalRegressions = 0;
        totalRevisits = 0;
        totalReReads = 0;
        wpmWindowSamples = [];
        console.log("[ReadingStateEngine] Reset.");
    }

    function injectGazeSampleForTesting(gazeData) {
        handleGazeUpdate(gazeData);
    }

    function overrideSignalQualityForTesting(score) {
        currentSignalQuality = score;
        lastFacePresent = score >= MIN_QUALITY_SCORE;
        lastBlinkState = false;
    }

    return {
        initialize: initialize,
        start: start,
        stop: stop,
        reset: reset,
        on: on,
        off: off,
        getCurrentMetrics: getCurrentMetrics,
        setDocumentWordCount: setDocumentWordCount,
        injectGazeSampleForTesting: injectGazeSampleForTesting,
        overrideSignalQualityForTesting: overrideSignalQualityForTesting
    };

})();

if (typeof window !== "undefined") {
    window.ReadingStateEngine = ReadingStateEngine;
    window.ReadingIntelligence = ReadingStateEngine;
}
