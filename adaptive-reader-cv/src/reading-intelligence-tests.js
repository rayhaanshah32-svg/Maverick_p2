var ReadingIntelligenceTests = (function () {

    var totalPassed = 0;
    var totalFailed = 0;
    var testLog = [];

    function logResult(testName, passed, details) {
        var status = passed ? "PASS" : "FAIL";
        var message = "[" + status + "] " + testName + (details ? " — " + details : "");
        testLog.push({ status: status, testName: testName, details: details || "" });
        console.log(message);
        if (passed) { totalPassed++; } else { totalFailed++; }
    }

    function assert(condition, testName, details) {
        logResult(testName, condition, details);
    }

    function makeSample(lineIndex, timestamp, confidence, x, y) {
        return {
            x: x !== undefined ? x : 400 + (Math.random() * 4 - 2),
            y: y !== undefined ? y : 200 + lineIndex * 30 + (Math.random() * 4 - 2),
            lineIndex: lineIndex,
            paragraphIndex: 0,
            confidence: confidence !== undefined ? confidence : 0.85,
            timestamp: timestamp
        };
    }

    function prepareEngine() {
        ReadingStateEngine.reset();
        DifficultyEngine.reset();
        ReadingStateEngine.overrideSignalQualityForTesting(90);
    }

    function injectSequence(lineArray, startTime, stepMs) {
        var time = startTime;
        var step = stepMs || 60;
        for (var i = 0; i < lineArray.length; i++) {
            ReadingStateEngine.injectGazeSampleForTesting(makeSample(lineArray[i], time));
            time += step;
        }
        return time;
    }

    function injectLineDuration(lineIndex, durationMs, startTime, stepMs) {
        var time = startTime;
        var step = stepMs || 50;
        var endTime = time + durationMs;
        while (time < endTime) {
            ReadingStateEngine.injectGazeSampleForTesting(makeSample(lineIndex, time));
            time += step;
        }
        return time;
    }

    function runScenarioA_CleanForwardReading() {
        prepareEngine();
        var startTime = Date.now() - 25000;

        injectSequence([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7], startTime, 300);

        var metrics = ReadingStateEngine.getCurrentMetrics();

        assert(metrics.regressions.total === 0, "A: zero regressions", "got " + metrics.regressions.total);
        assert(metrics.revisits.revisitCount === 0, "A: zero revisits", "got " + metrics.revisits.revisitCount);
        assert(metrics.signalIsUsable === true, "A: signal usable", "");

        var update = DifficultyEngine.computeUpdate(metrics);
        assert(update.rawScore < 30, "A: friction stays low", "rawScore=" + update.rawScore);

        assert(
            metrics.lineStats[1] && metrics.lineStats[1].visitCount === 1,
            "A: visitCount=1 per line, not inflated by frames",
            "visitCount=" + (metrics.lineStats[1] ? metrics.lineStats[1].visitCount : "missing")
        );

        assert(
            metrics.lineStats[1] && metrics.lineStats[1].revisitCount === 0,
            "A: revisitCount=0 for forward reading",
            "revisitCount=" + (metrics.lineStats[1] ? metrics.lineStats[1].revisitCount : "missing")
        );
    }

    function runScenarioB_OneRegression() {
        prepareEngine();
        var startTime = Date.now() - 20000;

        var time = injectSequence([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4], startTime, 120);
        time = injectLineDuration(3, 250, time, 50);
        injectSequence([3, 3, 3, 4, 4, 4, 5, 5, 5], time, 120);

        var metrics = ReadingStateEngine.getCurrentMetrics();

        assert(metrics.regressions.total === 1, "B: exactly one regression", "got " + metrics.regressions.total);
        assert(metrics.revisits.revisitCount === 1, "B: one revisit", "got " + metrics.revisits.revisitCount);

        var regressionHistory = metrics.regressions;
        assert(regressionHistory.lastTimestamp !== null, "B: regression timestamp recorded", "");
    }

    function runScenarioC_NoisyGaze() {
        prepareEngine();
        var startTime = Date.now() - 20000;

        var noisePattern = [3, 3, 3, 4, 3, 4, 4, 4, 5, 4, 5, 5, 5, 6, 5, 6, 6];
        var time = startTime;
        for (var i = 0; i < noisePattern.length; i++) {
            var lineIndex = noisePattern[i];
            var noisyX = 400 + Math.random() * 20 - 10;
            var noisyY = 200 + lineIndex * 30 + Math.random() * 12 - 6;
            ReadingStateEngine.injectGazeSampleForTesting({
                x: noisyX,
                y: noisyY,
                lineIndex: lineIndex,
                paragraphIndex: 0,
                confidence: 0.82,
                timestamp: time
            });
            time += 55;
        }

        var metrics = ReadingStateEngine.getCurrentMetrics();

        assert(
            metrics.regressions.total === 0,
            "C: noisy 1-frame oscillation does NOT count as regression",
            "got " + metrics.regressions.total
        );
    }

    function runScenarioD_PoorSignal() {
        prepareEngine();
        ReadingStateEngine.overrideSignalQualityForTesting(20);

        var startTime = Date.now() - 15000;
        var badPattern = [1, 2, 1, 3, 1, 2, 3, 1, 2, 3];
        for (var i = 0; i < badPattern.length; i++) {
            ReadingStateEngine.injectGazeSampleForTesting(makeSample(badPattern[i], startTime + i * 200, 0.1));
        }

        var metrics = ReadingStateEngine.getCurrentMetrics();
        assert(metrics.signalIsUsable === false, "D: signal marked unusable", "");
        assert(metrics.regressions.total === 0, "D: no regressions counted during bad signal", "got " + metrics.regressions.total);

        var update = DifficultyEngine.computeUpdate(metrics);
        assert(update.gatedScore < 40, "D: gated score stays near neutral", "gatedScore=" + update.gatedScore);
        assert(update.state === DifficultyEngine.STATES.FLOW, "D: state stays FLOW", "got " + update.state);
    }

    function runScenarioE_Recovery() {
        prepareEngine();
        ReadingStateEngine.overrideSignalQualityForTesting(90);

        var startTime = Date.now() - 45000;

        var hardPattern = [
            3, 3, 3, 3,
            2, 2, 2, 2, 2, 2,
            3, 3, 3,
            2, 2, 2, 2, 2, 2,
            3, 3, 3,
            2, 2, 2, 2, 2, 2
        ];
        var time = injectSequence(hardPattern, startTime, 90);

        var hardMetrics = ReadingStateEngine.getCurrentMetrics();
        var hardUpdate = DifficultyEngine.computeUpdate(hardMetrics);
        var hardScore = hardUpdate.rawScore;

        var easyPattern = [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12];
        injectSequence(easyPattern, time + 2000, 300);

        var easyMetrics = ReadingStateEngine.getCurrentMetrics();
        var easyUpdate = DifficultyEngine.computeUpdate(easyMetrics);

        assert(easyUpdate.rawScore < hardScore, "E: score drops after recovery", "hardScore=" + hardScore + " easyScore=" + easyUpdate.rawScore);
        assert(easyUpdate.contributions.regression <= hardUpdate.contributions.regression, "E: regression contribution falls after recovery", "");
    }

    function runScenarioF_PauseCountAccumulation() {
        prepareEngine();
        ReadingStateEngine.overrideSignalQualityForTesting(90);

        var startTime = Date.now() - 20000;

        var time = injectLineDuration(3, 3500, startTime, 50);
        time = injectSequence([4, 4, 4], time, 100);
        time = injectLineDuration(4, 3000, time, 50);

        var metrics = ReadingStateEngine.getCurrentMetrics();

        assert(metrics.pause.pauseCount >= 1, "F: pauseCount increments after leaving a stalled line", "got " + metrics.pause.pauseCount);
        assert(metrics.pause.longestMs >= 3000, "F: longestPauseMs captures the stall", "got " + metrics.pause.longestMs);
    }

    function runScenarioG_DiagnosticBreakdown() {
        prepareEngine();
        ReadingStateEngine.overrideSignalQualityForTesting(90);

        var startTime = Date.now() - 30000;
        var pattern = [2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 3, 4, 4, 5, 5];
        injectSequence(pattern, startTime, 120);

        var metrics = ReadingStateEngine.getCurrentMetrics();
        var update = DifficultyEngine.computeUpdate(metrics);

        assert(
            update.allContributions !== undefined && update.allContributions.length === 5,
            "G: allContributions has 5 entries",
            "got " + (update.allContributions ? update.allContributions.length : "undefined")
        );

        var totalCheck = 0;
        for (var i = 0; i < update.allContributions.length; i++) {
            totalCheck += update.allContributions[i].contribution;
            assert(
                update.allContributions[i].contribution <= update.allContributions[i].maxContribution,
                "G: " + update.allContributions[i].feature + " contribution <= maxContribution",
                update.allContributions[i].contribution + "/" + update.allContributions[i].maxContribution
            );
        }

        assert(
            totalCheck === update.rawScore,
            "G: sum of all contributions equals rawScore",
            "sum=" + totalCheck + " rawScore=" + update.rawScore
        );
    }

    function runScenarioH_DoubleInitGuard() {
        var before = 0;
        var countingListener = function () { before++; };
        ReadingStateEngine.on("onMetricsReady", countingListener);

        ReadingStateEngine.initialize();
        ReadingStateEngine.initialize();

        ReadingStateEngine.off("onMetricsReady", countingListener);

        assert(true, "H: double initialize() does not throw", "");
    }

    function runAll() {
        totalPassed = 0;
        totalFailed = 0;
        testLog = [];

        console.log("======= Reading Intelligence Tests =======");

        runScenarioA_CleanForwardReading();
        runScenarioB_OneRegression();
        runScenarioC_NoisyGaze();
        runScenarioD_PoorSignal();
        runScenarioE_Recovery();
        runScenarioF_PauseCountAccumulation();
        runScenarioG_DiagnosticBreakdown();
        runScenarioH_DoubleInitGuard();

        console.log("==========================================");
        console.log("Results: " + totalPassed + " passed, " + totalFailed + " failed");

        if (totalFailed === 0) {
            console.log("All tests passed.");
        } else {
            console.warn(totalFailed + " test(s) failed. Review output above.");
        }

        printTable();

        return { passed: totalPassed, failed: totalFailed, log: testLog };
    }

    function printTable() {
        console.log("\n%-60s %s".replace("%-60s", "Test Name").replace("%s", "Result"));
        console.log("-".repeat(70));
        for (var i = 0; i < testLog.length; i++) {
            var entry = testLog[i];
            var label = entry.testName.padEnd ? entry.testName.padEnd(60) : entry.testName;
            var detail = entry.details ? "  [" + entry.details + "]" : "";
            console.log(entry.status + "  " + label + detail);
        }
    }

    return {
        runAll: runAll
    };

})();
