const BaselineCapture = (function () {

    const BASELINE_MAX_DURATION_MS = 35000;
    const FIXATION_THRESHOLD_PX = 38;
    const FIXATION_MIN_DURATION_MS = 80;
    const BLINK_SAMPLE_INTERVAL_MS = 150;
    const PASSAGE_TOTAL_WORDS = 95;

    const MIN_SAFE_WPM = 90;
    const MAX_SAFE_WPM = 420;
    const MIN_SAFE_FIXATION_MS = 130;
    const MAX_SAFE_FIXATION_MS = 550;
    const MIN_SAFE_BLINK_RATE = 4;
    const MAX_SAFE_BLINK_RATE = 35;

    let isRunning = false;
    let startTime = null;
    let autoFinishTimeoutId = null;
    let countdownIntervalId = null;
    let blinkCheckIntervalId = null;
    let collectedSamples = [];
    let blinkCount = 0;
    let lastBlinkState = false;
    let gazeUpdateListener = null;

    let overlayElement = null;
    let progressBarElement = null;
    let timerLabelElement = null;

    function createBaselineModal() {
        overlayElement = document.createElement("div");
        overlayElement.id = "baseline-modal-overlay";
        overlayElement.style.position = "fixed";
        overlayElement.style.inset = "0";
        overlayElement.style.backgroundColor = "rgba(7, 8, 16, 0.94)";
        overlayElement.style.backdropFilter = "blur(10px)";
        overlayElement.style.zIndex = "99990";
        overlayElement.style.display = "flex";
        overlayElement.style.flexDirection = "column";
        overlayElement.style.alignItems = "center";
        overlayElement.style.justifyContent = "center";
        overlayElement.style.padding = "24px";
        overlayElement.style.boxSizing = "border-box";
        overlayElement.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";

        const card = document.createElement("div");
        card.style.maxWidth = "720px";
        card.style.width = "100%";
        card.style.backgroundColor = "#13152a";
        card.style.border = "1px solid rgba(92, 107, 192, 0.4)";
        card.style.borderRadius = "14px";
        card.style.padding = "28px 36px";
        card.style.boxShadow = "0 12px 40px rgba(0, 0, 0, 0.6)";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.gap = "18px";

        const headerRow = document.createElement("div");
        headerRow.style.display = "flex";
        headerRow.style.alignItems = "center";
        headerRow.style.justifyContent = "space-between";

        const title = document.createElement("h2");
        title.textContent = "Personal Reading Baseline";
        title.style.color = "#f0f2ff";
        title.style.fontSize = "20px";
        title.style.margin = "0";
        headerRow.appendChild(title);

        timerLabelElement = document.createElement("div");
        timerLabelElement.textContent = "35s remaining";
        timerLabelElement.style.fontSize = "13px";
        timerLabelElement.style.fontWeight = "600";
        timerLabelElement.style.color = "#7986cb";
        headerRow.appendChild(timerLabelElement);

        card.appendChild(headerRow);

        const instructions = document.createElement("p");
        instructions.textContent = "Read the passage below naturally at your own comfortable pace. We are measuring your personal baseline speed, fixations, and blink rate.";
        instructions.style.color = "#9fa3c0";
        instructions.style.fontSize = "13px";
        instructions.style.lineHeight = "1.5";
        instructions.style.margin = "0";
        card.appendChild(instructions);

        const track = document.createElement("div");
        track.style.height = "6px";
        track.style.backgroundColor = "#2a2d4a";
        track.style.borderRadius = "3px";
        track.style.overflow = "hidden";

        progressBarElement = document.createElement("div");
        progressBarElement.style.height = "100%";
        progressBarElement.style.width = "0%";
        progressBarElement.style.background = "linear-gradient(90deg, #5c6bc0, #10b981)";
        progressBarElement.style.transition = "width 0.5s linear";
        track.appendChild(progressBarElement);
        card.appendChild(track);

        const passageBox = document.createElement("div");
        passageBox.style.fontFamily = "'Lexend', 'Inter', sans-serif";
        passageBox.style.fontSize = "18px";
        passageBox.style.lineHeight = "1.9";
        passageBox.style.color = "#e8eaf0";
        passageBox.style.backgroundColor = "#0d0e1a";
        passageBox.style.padding = "20px";
        passageBox.style.borderRadius = "8px";
        passageBox.style.border = "1px solid #2a2d4a";
        passageBox.textContent = "Language and reading rely on rapid, unconscious synchronization between visual perception and memory. When readers encounter words, their eyes perform quick jumps called saccades, followed by brief pauses called fixations. Measuring these natural eye movements allows adaptive software to tailor the text presentation to each person's unique cognitive profile without interrupting their flow.";
        card.appendChild(passageBox);

        const buttonRow = document.createElement("div");
        buttonRow.style.display = "flex";
        buttonRow.style.alignItems = "center";
        buttonRow.style.justifyContent = "space-between";
        buttonRow.style.marginTop = "8px";

        const skipBtn = document.createElement("button");
        skipBtn.textContent = "⚡ Fast Skip (Dev Default)";
        skipBtn.style.padding = "8px 14px";
        skipBtn.style.fontSize = "12px";
        skipBtn.style.backgroundColor = "transparent";
        skipBtn.style.border = "1px dashed #5a5e7a";
        skipBtn.style.color = "#9fa3c0";
        skipBtn.style.borderRadius = "6px";
        skipBtn.style.cursor = "pointer";
        skipBtn.onclick = function () {
            skipBaselineWithDefaults();
        };
        buttonRow.appendChild(skipBtn);

        const doneBtn = document.createElement("button");
        doneBtn.textContent = "✓ Finished Reading";
        doneBtn.style.padding = "9px 20px";
        doneBtn.style.fontSize = "13px";
        doneBtn.style.fontWeight = "600";
        doneBtn.style.backgroundColor = "#10b981";
        doneBtn.style.color = "#ffffff";
        doneBtn.style.border = "none";
        doneBtn.style.borderRadius = "8px";
        doneBtn.style.cursor = "pointer";
        doneBtn.onclick = function () {
            finishBaseline();
        };
        buttonRow.appendChild(doneBtn);

        card.appendChild(buttonRow);
        overlayElement.appendChild(card);
        document.body.appendChild(overlayElement);
    }

    function removeBaselineModal() {
        if (overlayElement && overlayElement.parentNode) {
            overlayElement.parentNode.removeChild(overlayElement);
            overlayElement = null;
        }
    }

    function startBaseline() {
        if (isRunning) {
            return;
        }

        isRunning = true;
        startTime = Date.now();
        collectedSamples = [];
        blinkCount = 0;
        lastBlinkState = false;

        createBaselineModal();
        console.log("[BaselineCapture] Started guided baseline reading session…");

        gazeUpdateListener = function (gazeData) {
            if (isRunning) {
                collectedSamples.push({
                    x: gazeData.x,
                    y: gazeData.y,
                    timestamp: gazeData.timestamp || Date.now(),
                    lineIndex: gazeData.lineIndex
                });
            }
        };
        EventAPI.on("onGazeUpdate", gazeUpdateListener);

        blinkCheckIntervalId = setInterval(function () {
            const quality = MediaPipeEngine.getLastQualityData();
            if (quality.blinkState && !lastBlinkState) {
                blinkCount++;
            }
            lastBlinkState = quality.blinkState;
        }, BLINK_SAMPLE_INTERVAL_MS);

        countdownIntervalId = setInterval(function () {
            const elapsed = Date.now() - startTime;
            const remainingSec = Math.max(0, Math.ceil((BASELINE_MAX_DURATION_MS - elapsed) / 1000));
            const progressFraction = Math.min(1, elapsed / BASELINE_MAX_DURATION_MS);

            if (timerLabelElement) {
                timerLabelElement.textContent = remainingSec + "s remaining";
            }
            if (progressBarElement) {
                progressBarElement.style.width = Math.round(progressFraction * 100) + "%";
            }
        }, 300);

        autoFinishTimeoutId = setTimeout(function () {
            finishBaseline();
        }, BASELINE_MAX_DURATION_MS);
    }

    function computeFixations(samples) {
        if (samples.length < 2) {
            return [];
        }

        const fixations = [];
        let fixationStartIndex = 0;

        for (let i = 1; i < samples.length; i++) {
            const dist = Math.sqrt(
                Math.pow(samples[i].x - samples[fixationStartIndex].x, 2) +
                Math.pow(samples[i].y - samples[fixationStartIndex].y, 2)
            );

            const isLast = i === samples.length - 1;

            if (dist > FIXATION_THRESHOLD_PX || isLast) {
                const duration = samples[i - 1].timestamp - samples[fixationStartIndex].timestamp;
                if (duration >= FIXATION_MIN_DURATION_MS) {
                    fixations.push({
                        duration: duration,
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

    function finishBaseline() {
        if (!isRunning) {
            return;
        }
        isRunning = false;

        if (autoFinishTimeoutId) {
            clearTimeout(autoFinishTimeoutId);
            autoFinishTimeoutId = null;
        }
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
        }
        if (blinkCheckIntervalId) {
            clearInterval(blinkCheckIntervalId);
            blinkCheckIntervalId = null;
        }
        if (gazeUpdateListener) {
            EventAPI.off("onGazeUpdate", gazeUpdateListener);
            gazeUpdateListener = null;
        }

        removeBaselineModal();

        const durationSeconds = Math.max(5, (Date.now() - startTime) / 1000);
        const durationMinutes = durationSeconds / 60;

        let rawWPM = Math.round(PASSAGE_TOTAL_WORDS / durationMinutes);
        let baselineWPM = rawWPM;

        if (rawWPM < MIN_SAFE_WPM || rawWPM > MAX_SAFE_WPM) {
            console.warn(
                "[BaselineCapture] Raw WPM (" + rawWPM + ") was outside normal reading range. Clamping to sane baseline."
            );
            baselineWPM = Math.max(MIN_SAFE_WPM, Math.min(MAX_SAFE_WPM, rawWPM));
        }

        const fixations = computeFixations(collectedSamples);
        let rawAvgFixation = 240;
        if (fixations.length > 0) {
            let totalFixTime = 0;
            for (let i = 0; i < fixations.length; i++) {
                totalFixTime += fixations[i].duration;
            }
            rawAvgFixation = Math.round(totalFixTime / fixations.length);
        }

        const baselineFixationMs = Math.max(
            MIN_SAFE_FIXATION_MS,
            Math.min(MAX_SAFE_FIXATION_MS, rawAvgFixation)
        );

        const rawBlinkRate = parseFloat(((blinkCount / durationSeconds) * 60).toFixed(1));
        const baselineBlinkRate = Math.max(
            MIN_SAFE_BLINK_RATE,
            Math.min(MAX_SAFE_BLINK_RATE, rawBlinkRate || 14)
        );

        const baselinePayload = {
            baselineWPM: baselineWPM,
            baselineFixationMs: baselineFixationMs,
            baselineBlinkRate: baselineBlinkRate,
            wordsPerMinute: baselineWPM,
            averageFixationDuration: baselineFixationMs,
            blinkRate: baselineBlinkRate,
            durationSeconds: parseFloat(durationSeconds.toFixed(1)),
            totalFixations: fixations.length,
            wordsRead: PASSAGE_TOTAL_WORDS
        };

        console.log("[BaselineCapture] Baseline Complete:", baselinePayload);
        EventAPI.emitBaselineComplete(baselinePayload);
    }

    function skipBaselineWithDefaults() {
        if (isRunning) {
            isRunning = false;
            if (autoFinishTimeoutId) { clearTimeout(autoFinishTimeoutId); }
            if (countdownIntervalId) { clearInterval(countdownIntervalId); }
            if (blinkCheckIntervalId) { clearInterval(blinkCheckIntervalId); }
            if (gazeUpdateListener) {
                EventAPI.off("onGazeUpdate", gazeUpdateListener);
                gazeUpdateListener = null;
            }
            removeBaselineModal();
        }

        const defaultPayload = {
            baselineWPM: 220,
            baselineFixationMs: 240,
            baselineBlinkRate: 15.0,
            wordsPerMinute: 220,
            averageFixationDuration: 240,
            blinkRate: 15.0,
            durationSeconds: 30.0,
            totalFixations: 42,
            wordsRead: PASSAGE_TOTAL_WORDS
        };

        console.log("[BaselineCapture] Dev Fast Skip used. Emitting default baseline:", defaultPayload);
        EventAPI.emitBaselineComplete(defaultPayload);
    }

    function stopBaseline() {
        if (!isRunning) {
            return;
        }
        finishBaseline();
    }

    return {
        startBaseline: startBaseline,
        stopBaseline: stopBaseline,
        skipBaselineWithDefaults: skipBaselineWithDefaults
    };

})();
