const DifficultyEngine = (function () {

    var WEIGHT_REGRESSION = 30;
    var WEIGHT_FIXATION = 25;
    var WEIGHT_SPEED = 20;
    var WEIGHT_DWELL_PAUSE = 15;
    var WEIGHT_LINE_TRANSITION = 10;

    var EMA_ALPHA = 0.3;
    var Z_SCORE_EPSILON = 10;
    var Z_SCORE_MAX = 3;

    var SCORE_FLOW_MAX = 35;
    var SCORE_MILD_MAX = 55;
    var SCORE_HIGH_MAX = 75;

    var STATE_FLOW = "FLOW";
    var STATE_MILD = "MILD_FRICTION";
    var STATE_HIGH = "HIGH_FRICTION";
    var STATE_ASSIST = "ASSIST";

    var STATE_ESCALATE_PERSIST_MS = 2500;
    var STATE_RECOVERY_PERSIST_MS = 4000;

    var MIN_QUALITY_TO_SCORE = 45;
    var NEUTRAL_SCORE = 25;

    var SELF_CALIBRATION_MIN_SAMPLES = 10;
    var SELF_CALIBRATION_WINDOW_MS = 60000;

    var selfCalibratingRegressionSamples = [];

    var smoothedScore = NEUTRAL_SCORE;
    var currentState = STATE_FLOW;
    var pendingStateCandidate = null;
    var pendingStateSince = null;

    var lastDetailedBreakdown = null;

    function clampValue(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function computeZScore(currentValue, baselineMean, baselineStd) {
        var effectiveStd = Math.max(baselineStd, Z_SCORE_EPSILON);
        var zScore = (currentValue - baselineMean) / effectiveStd;
        return clampValue(zScore, -Z_SCORE_MAX, Z_SCORE_MAX);
    }

    function mapZScoreToContribution(zScore, maxContribution) {
        if (zScore <= 0) {
            return 0;
        }
        return clampValue((zScore / Z_SCORE_MAX) * maxContribution, 0, maxContribution);
    }

    function updateSelfCalibratingRegressionBaseline(regressionRate) {
        var now = Date.now();
        selfCalibratingRegressionSamples.push({ value: regressionRate, timestamp: now });

        var cutoffTime = now - SELF_CALIBRATION_WINDOW_MS;
        while (
            selfCalibratingRegressionSamples.length > 0 &&
            selfCalibratingRegressionSamples[0].timestamp < cutoffTime
        ) {
            selfCalibratingRegressionSamples.shift();
        }
    }

    function getSelfCalibratedRegressionBaseline() {
        if (selfCalibratingRegressionSamples.length < SELF_CALIBRATION_MIN_SAMPLES) {
            return { mean: 0, std: 1.5, sampleCount: selfCalibratingRegressionSamples.length };
        }

        var values = selfCalibratingRegressionSamples.map(function (s) { return s.value; });
        var sum = 0;
        for (var i = 0; i < values.length; i++) { sum += values[i]; }
        var mean = sum / values.length;

        var squaredDiffSum = 0;
        for (var j = 0; j < values.length; j++) {
            squaredDiffSum += Math.pow(values[j] - mean, 2);
        }
        var std = Math.sqrt(squaredDiffSum / values.length);

        return { mean: mean, std: std, sampleCount: values.length };
    }

    function computeRegressionContribution(metrics) {
        var recentRegressionCount = metrics.regressions.recentCount;
        var regressionRate = metrics.regressions.regressionRate;

        updateSelfCalibratingRegressionBaseline(regressionRate);
        var baseline = getSelfCalibratedRegressionBaseline();

        var zScore = recentRegressionCount === 0 ? 0 : computeZScore(regressionRate, baseline.mean, baseline.std);
        var contribution = mapZScoreToContribution(zScore, WEIGHT_REGRESSION);

        return {
            feature: "regression_rate",
            zScore: parseFloat(zScore.toFixed(2)),
            contribution: Math.round(contribution),
            maxContribution: WEIGHT_REGRESSION,
            rawValue: parseFloat(regressionRate.toFixed(2)),
            baselineValue: parseFloat(baseline.mean.toFixed(2)),
            baselineStd: parseFloat(baseline.std.toFixed(2)),
            sampleCount: baseline.sampleCount
        };
    }

    function computeFixationContribution(metrics) {
        var currentFixationMs = metrics.fixations.recentMedianMs;
        var baselineMs = metrics.baseline.baselineFixationMs;

        if (currentFixationMs === 0) {
            return {
                feature: "fixation_anomaly",
                zScore: 0,
                contribution: 0,
                maxContribution: WEIGHT_FIXATION,
                rawValue: 0,
                baselineValue: baselineMs,
                baselineStd: Math.round(baselineMs * 0.3)
            };
        }

        var baselineStd = baselineMs * 0.3;
        var zScore = computeZScore(currentFixationMs, baselineMs, baselineStd);
        var contribution = mapZScoreToContribution(zScore, WEIGHT_FIXATION);

        return {
            feature: "fixation_anomaly",
            zScore: parseFloat(zScore.toFixed(2)),
            contribution: Math.round(contribution),
            maxContribution: WEIGHT_FIXATION,
            rawValue: currentFixationMs,
            baselineValue: baselineMs,
            baselineStd: Math.round(baselineStd)
        };
    }

    function computeSpeedContribution(metrics) {
        var currentWPM = metrics.wpm.currentWPM;
        var baselineWPM = metrics.wpm.baselineWPM;

        if (currentWPM === 0 || baselineWPM === 0) {
            return {
                feature: "reading_speed_slowdown",
                zScore: 0,
                contribution: 0,
                maxContribution: WEIGHT_SPEED,
                rawValue: currentWPM,
                baselineValue: baselineWPM,
                baselineStd: 0
            };
        }

        var speedRatio = currentWPM / baselineWPM;
        var slowdownFraction = clampValue(1 - speedRatio, 0, 1);

        var slowdownBaselineStd = 0.25;
        var zScore = computeZScore(slowdownFraction, 0, slowdownBaselineStd);
        var contribution = mapZScoreToContribution(zScore, WEIGHT_SPEED);

        return {
            feature: "reading_speed_slowdown",
            zScore: parseFloat(zScore.toFixed(2)),
            contribution: Math.round(contribution),
            maxContribution: WEIGHT_SPEED,
            rawValue: currentWPM,
            baselineValue: baselineWPM,
            baselineStd: Math.round(slowdownBaselineStd * baselineWPM)
        };
    }

    function computeDwellPauseContribution(metrics) {
        var currentPauseMs = metrics.pause.currentMs;

        if (currentPauseMs === 0) {
            return {
                feature: "dwell_pause_anomaly",
                zScore: 0,
                contribution: 0,
                maxContribution: WEIGHT_DWELL_PAUSE,
                rawValue: 0,
                baselineValue: 1200,
                baselineStd: 500
            };
        }

        var pauseBaseline = 1200;
        var pauseStd = 500;
        var zScore = computeZScore(currentPauseMs, pauseBaseline, pauseStd);
        var contribution = mapZScoreToContribution(zScore, WEIGHT_DWELL_PAUSE);

        return {
            feature: "dwell_pause_anomaly",
            zScore: parseFloat(zScore.toFixed(2)),
            contribution: Math.round(contribution),
            maxContribution: WEIGHT_DWELL_PAUSE,
            rawValue: currentPauseMs,
            baselineValue: pauseBaseline,
            baselineStd: pauseStd
        };
    }

    function computeLineTransitionContribution(metrics) {
        var instability = metrics.lineTransitionInstability;

        if (instability === 0) {
            return {
                feature: "line_transition_instability",
                zScore: 0,
                contribution: 0,
                maxContribution: WEIGHT_LINE_TRANSITION,
                rawValue: 0,
                baselineValue: 0.1,
                baselineStd: 0.1
            };
        }

        var instabilityBaseline = 0.1;
        var instabilityStd = 0.1;
        var zScore = computeZScore(instability, instabilityBaseline, instabilityStd);
        var contribution = mapZScoreToContribution(zScore, WEIGHT_LINE_TRANSITION);

        return {
            feature: "line_transition_instability",
            zScore: parseFloat(zScore.toFixed(2)),
            contribution: Math.round(contribution),
            maxContribution: WEIGHT_LINE_TRANSITION,
            rawValue: parseFloat(instability.toFixed(3)),
            baselineValue: instabilityBaseline,
            baselineStd: instabilityStd
        };
    }

    function computeAllContributions(metrics) {
        var regressionResult = computeRegressionContribution(metrics);
        var fixationResult = computeFixationContribution(metrics);
        var speedResult = computeSpeedContribution(metrics);
        var dwellResult = computeDwellPauseContribution(metrics);
        var transitionResult = computeLineTransitionContribution(metrics);

        var rawScore =
            regressionResult.contribution +
            fixationResult.contribution +
            speedResult.contribution +
            dwellResult.contribution +
            transitionResult.contribution;

        rawScore = clampValue(rawScore, 0, 100);

        var all = [regressionResult, fixationResult, speedResult, dwellResult, transitionResult];
        all.sort(function (a, b) { return b.contribution - a.contribution; });

        var topEvidence = all.filter(function (item) { return item.contribution > 0; }).slice(0, 3);

        return {
            rawScore: rawScore,
            evidence: topEvidence,
            all: all,
            contributionMap: {
                regression: regressionResult.contribution,
                fixation: fixationResult.contribution,
                speed: speedResult.contribution,
                dwellPause: dwellResult.contribution,
                lineTransition: transitionResult.contribution
            }
        };
    }

    function applySignalQualityGating(rawScore, signalQuality) {
        if (signalQuality >= MIN_QUALITY_TO_SCORE) {
            return rawScore;
        }
        var qualityFraction = signalQuality / MIN_QUALITY_TO_SCORE;
        var gatedScore = rawScore * qualityFraction + NEUTRAL_SCORE * (1 - qualityFraction);
        return clampValue(gatedScore, 0, 100);
    }

    function applyEMASmoothing(newRawScore) {
        smoothedScore = EMA_ALPHA * newRawScore + (1 - EMA_ALPHA) * smoothedScore;
        return Math.round(smoothedScore);
    }

    function determineStateForScore(score) {
        if (score <= SCORE_FLOW_MAX) { return STATE_FLOW; }
        if (score <= SCORE_MILD_MAX) { return STATE_MILD; }
        if (score <= SCORE_HIGH_MAX) { return STATE_HIGH; }
        return STATE_ASSIST;
    }

    function getStateSeverity(state) {
        if (state === STATE_FLOW) { return 0; }
        if (state === STATE_MILD) { return 1; }
        if (state === STATE_HIGH) { return 2; }
        if (state === STATE_ASSIST) { return 3; }
        return 0;
    }

    function updateStateMachine(candidateState) {
        var now = Date.now();

        if (candidateState === currentState) {
            return currentState;
        }

        var candidateSeverity = getStateSeverity(candidateState);
        var currentSeverity = getStateSeverity(currentState);
        var isEscalation = candidateSeverity > currentSeverity;
        var requiredPersistMs = isEscalation ? STATE_ESCALATE_PERSIST_MS : STATE_RECOVERY_PERSIST_MS;

        if (pendingStateCandidate !== candidateState) {
            pendingStateCandidate = candidateState;
            pendingStateSince = now;
            return currentState;
        }

        var persistedMs = now - pendingStateSince;
        if (persistedMs >= requiredPersistMs) {
            currentState = candidateState;
            pendingStateCandidate = null;
            pendingStateSince = null;
        }

        return currentState;
    }

    function computeUpdate(metrics) {
        var scoreResult = computeAllContributions(metrics);
        var gatedScore = applySignalQualityGating(scoreResult.rawScore, metrics.signalQuality);
        var finalSmoothedScore = applyEMASmoothing(gatedScore);

        var candidateState = determineStateForScore(finalSmoothedScore);
        var resolvedState = updateStateMachine(candidateState);

        var evidenceLabels = scoreResult.evidence.map(function (item) { return item.feature; });

        lastDetailedBreakdown = {
            smoothedScore: finalSmoothedScore,
            rawScore: scoreResult.rawScore,
            gatedScore: Math.round(gatedScore),
            state: resolvedState,
            all: scoreResult.all
        };

        return {
            rawScore: scoreResult.rawScore,
            gatedScore: Math.round(gatedScore),
            smoothedScore: finalSmoothedScore,
            state: resolvedState,
            evidence: scoreResult.evidence,
            evidenceLabels: evidenceLabels,
            contributions: scoreResult.contributionMap,
            allContributions: scoreResult.all,
            signalQuality: metrics.signalQuality,
            timestamp: Date.now()
        };
    }

    function getDetailedBreakdown() {
        return lastDetailedBreakdown;
    }

    function getCurrentSmoothedScore() {
        return Math.round(smoothedScore);
    }

    function getCurrentState() {
        return currentState;
    }

    function reset() {
        smoothedScore = NEUTRAL_SCORE;
        currentState = STATE_FLOW;
        pendingStateCandidate = null;
        pendingStateSince = null;
        selfCalibratingRegressionSamples = [];
        lastDetailedBreakdown = null;
        console.log("[DifficultyEngine] Reset.");
    }

    return {
        computeUpdate: computeUpdate,
        getDetailedBreakdown: getDetailedBreakdown,
        getCurrentSmoothedScore: getCurrentSmoothedScore,
        getCurrentState: getCurrentState,
        reset: reset,
        STATES: {
            FLOW: STATE_FLOW,
            MILD_FRICTION: STATE_MILD,
            HIGH_FRICTION: STATE_HIGH,
            ASSIST: STATE_ASSIST
        },
        WEIGHTS: {
            REGRESSION: WEIGHT_REGRESSION,
            FIXATION: WEIGHT_FIXATION,
            SPEED: WEIGHT_SPEED,
            DWELL_PAUSE: WEIGHT_DWELL_PAUSE,
            LINE_TRANSITION: WEIGHT_LINE_TRANSITION
        }
    };

})();

if (typeof window !== "undefined") {
    window.DifficultyEngine = DifficultyEngine;
}
