const CalibrationUI = (function () {

    const POINT_DWELL_MS = 2200;
    const SACCADE_MS = 450;

    const NINE_POINTS = [
        { xPercent: 0.15, yPercent: 0.15 },
        { xPercent: 0.50, yPercent: 0.15 },
        { xPercent: 0.85, yPercent: 0.15 },
        { xPercent: 0.15, yPercent: 0.50 },
        { xPercent: 0.50, yPercent: 0.50 },
        { xPercent: 0.85, yPercent: 0.50 },
        { xPercent: 0.15, yPercent: 0.85 },
        { xPercent: 0.50, yPercent: 0.85 },
        { xPercent: 0.85, yPercent: 0.85 }
    ];

    const FIVE_POINTS = [
        { xPercent: 0.15, yPercent: 0.15 },
        { xPercent: 0.85, yPercent: 0.15 },
        { xPercent: 0.50, yPercent: 0.50 },
        { xPercent: 0.15, yPercent: 0.85 },
        { xPercent: 0.85, yPercent: 0.85 }
    ];

    let overlayEl = null;
    let dotEl = null;
    let dotFillEl = null;
    let dotRingEl = null;
    let instructionEl = null;
    let progressEl = null;
    let statusEl = null;
    let redoBtnEl = null;

    let isCalibrating = false;
    let redoRequested = false;
    let lastPointX = 0;
    let lastPointY = 0;

    let inMemoryProfile = {
        calibrated: false,
        timestamp: null,
        mode: "none",
        overallScore: 0,
        pointResults: []
    };

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function buildOverlay() {
        if (overlayEl) {
            return;
        }

        overlayEl = document.createElement("div");
        overlayEl.id = "calibration-overlay";
        overlayEl.style.cssText = [
            "position:fixed", "inset:0",
            "width:100vw", "height:100vh",
            "background:rgba(10,14,28,0.97)",
            "backdrop-filter:blur(18px)",
            "-webkit-backdrop-filter:blur(18px)",
            "z-index:99999",
            "font-family:'Lexend','Inter',sans-serif",
            "overflow:hidden"
        ].join(";");

        instructionEl = document.createElement("div");
        instructionEl.style.cssText = [
            "position:absolute", "top:36px", "left:50%",
            "transform:translateX(-50%)",
            "text-align:center",
            "pointer-events:none"
        ].join(";");
        instructionEl.innerHTML = [
            '<div style="color:#e8ecff;font-size:22px;font-weight:600;letter-spacing:0.02em;margin-bottom:8px">',
            "Look at each dot as it appears",
            "</div>",
            '<div id="calib-status-text" style="color:#7b83b8;font-size:14px;line-height:1.5">',
            "Keep your head still. Move only your eyes.",
            "</div>"
        ].join("");
        overlayEl.appendChild(instructionEl);

        statusEl = document.getElementById("calib-status-text");

        progressEl = document.createElement("div");
        progressEl.id = "calib-progress";
        progressEl.style.cssText = [
            "position:absolute", "bottom:36px", "left:50%",
            "transform:translateX(-50%)",
            "display:flex", "align-items:center", "gap:16px",
            "pointer-events:none"
        ].join(";");
        overlayEl.appendChild(progressEl);

        redoBtnEl = document.createElement("button");
        redoBtnEl.id = "calibration-redo-btn";
        redoBtnEl.textContent = "↺  Redo Last Point";
        redoBtnEl.style.cssText = [
            "position:absolute", "bottom:32px", "right:32px",
            "padding:8px 18px",
            "border-radius:20px",
            "background:rgba(255,255,255,0.88)",
            "border:1px solid rgba(30,58,95,0.22)",
            "color:#1e3a5f",
            "font-size:12px", "font-weight:600",
            "cursor:pointer", "font-family:inherit",
            "display:none",
            "transition:background 0.15s,transform 0.1s"
        ].join(";");
        redoBtnEl.addEventListener("click", function () {
            redoRequested = true;
            redoBtnEl.style.display = "none";
        });
        overlayEl.appendChild(redoBtnEl);

        const dotWrapper = document.createElement("div");
        dotWrapper.style.cssText = [
            "position:absolute", "width:0", "height:0",
            "id='calib-dot-anchor'"
        ].join(";");

        dotRingEl = document.createElement("div");
        dotRingEl.style.cssText = [
            "position:absolute",
            "width:70px", "height:70px",
            "border-radius:50%",
            "border:2px solid rgba(95,168,211,0.6)",
            "transform:translate(-50%,-50%)",
            "animation:calib-pulse 1.4s ease-out infinite",
            "pointer-events:none"
        ].join(";");
        dotWrapper.appendChild(dotRingEl);

        dotEl = document.createElement("div");
        dotEl.style.cssText = [
            "position:absolute",
            "width:22px", "height:22px",
            "border-radius:50%",
            "transform:translate(-50%,-50%)",
            "background:#5fa8d3",
            "border:3px solid #fff",
            "box-shadow:0 0 20px rgba(95,168,211,0.9)",
            "transition:background 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease",
            "cursor:pointer"
        ].join(";");
        dotWrapper.appendChild(dotEl);

        dotFillEl = document.createElement("div");
        dotFillEl.style.cssText = [
            "position:absolute",
            "width:22px", "height:22px",
            "border-radius:50%",
            "transform:translate(-50%,-50%) scale(0)",
            "background:rgba(255,255,255,0.6)",
            "transition:transform 0.1s ease, opacity 0.2s ease",
            "pointer-events:none"
        ].join(";");
        dotWrapper.appendChild(dotFillEl);

        overlayEl.appendChild(dotWrapper);
        window._calibDotWrapper = dotWrapper;

        if (!document.getElementById("calib-keyframes")) {
            const style = document.createElement("style");
            style.id = "calib-keyframes";
            style.textContent = [
                "@keyframes calib-pulse {",
                "0%{transform:translate(-50%,-50%) scale(0.5);opacity:1}",
                "100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}",
                "}",
                "@keyframes calib-fill {",
                "0%{stroke-dashoffset:251}",
                "100%{stroke-dashoffset:0}",
                "}"
            ].join("");
            document.head.appendChild(style);
        }

        document.body.appendChild(overlayEl);
    }

    function removeOverlay() {
        if (window._calibDotWrapper) {
            delete window._calibDotWrapper;
        }
        if (overlayEl && overlayEl.parentNode) {
            overlayEl.parentNode.removeChild(overlayEl);
        }
        overlayEl = null;
        dotEl = null;
        dotFillEl = null;
        dotRingEl = null;
        instructionEl = null;
        progressEl = null;
        statusEl = null;
        redoBtnEl = null;
    }

    function placeDotAt(px, py) {
        if (!window._calibDotWrapper) {
            return;
        }
        window._calibDotWrapper.style.left = px + "px";
        window._calibDotWrapper.style.top = py + "px";
        dotEl.style.background = "#5fa8d3";
        dotEl.style.boxShadow = "0 0 20px rgba(95,168,211,0.9)";
        dotEl.style.transform = "translate(-50%,-50%) scale(1)";
        dotRingEl.style.borderColor = "rgba(95,168,211,0.6)";
        dotFillEl.style.transform = "translate(-50%,-50%) scale(0)";
    }

    function trainWebGazer(px, py, samplesCount) {
        return new Promise(async function (resolve) {
            if (typeof webgazer === "undefined" || webgazer === null) {
                resolve(0);
                return;
            }
            let count = 0;
            for (let sampleIndex = 0; sampleIndex < samplesCount; sampleIndex = sampleIndex + 1) {
                try {
                    const prediction = webgazer.getCurrentPrediction
                        ? webgazer.getCurrentPrediction()
                        : null;
                    const currentPrediction = await Promise.resolve(prediction);
                    if (currentPrediction && Number.isFinite(currentPrediction.x) && Number.isFinite(currentPrediction.y)) {
                        webgazer.recordScreenPosition(px, py, "click");
                        count = count + 1;
                    }
                } catch (e) {
                    void 0;
                }
                await wait(60);
            }
            resolve(count);
        });
    }

    async function waitForUsableFaceAndGaze(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const quality = typeof MediaPipeEngine !== "undefined"
                ? MediaPipeEngine.getLastQualityData()
                : null;
            if (quality && quality.facePresent && !quality.blinkState &&
                typeof webgazer !== "undefined" && webgazer &&
                typeof webgazer.getCurrentPrediction === "function") {
                try {
                    const prediction = await Promise.resolve(webgazer.getCurrentPrediction());
                    if (prediction && Number.isFinite(prediction.x) && Number.isFinite(prediction.y)) {
                        return true;
                    }
                } catch (error) {
                    void 0;
                }
            }
            await wait(120);
        }
        return false;
        const quality = typeof MediaPipeEngine !== "undefined"
            ? MediaPipeEngine.getLastQualityData()
            : null;
        return !!(quality && quality.facePresent && !quality.blinkState &&
            typeof webgazer !== "undefined" && webgazer &&
            typeof webgazer.getCurrentPrediction === "function");
    }

    function animateDotProgress(durationMs, onTick) {
        return new Promise(function (resolve) {
            const start = Date.now();
            function step() {
                const elapsed = Date.now() - start;
                const progress = Math.min(elapsed / durationMs, 1);

                if (dotEl) {
                    const scale = 0.85 + (progress * 0.35);
                    dotEl.style.transform = "translate(-50%,-50%) scale(" + scale + ")";
                }

                const green = Math.round(95 + (185 - 95) * progress);
                const blue = Math.round(211 + (129 - 211) * progress);
                if (dotEl) {
                    dotEl.style.background = "rgb(95," + green + "," + blue + ")";
                    dotEl.style.boxShadow = "0 0 " + (20 + Math.round(progress * 20)) + "px rgba(16,185,129,0.8)";
                }

                if (typeof onTick === "function") {
                    onTick(progress);
                }

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    function flashCaptureDone() {
        if (!dotEl) {
            return Promise.resolve();
        }
        dotEl.style.background = "#ffffff";
        dotEl.style.boxShadow = "0 0 48px rgba(255,255,255,1)";
        dotEl.style.transform = "translate(-50%,-50%) scale(1.5)";
        dotFillEl.style.transform = "translate(-50%,-50%) scale(1.6)";

        return wait(220).then(function () {
            dotEl.style.transform = "translate(-50%,-50%) scale(0)";
            dotRingEl.style.opacity = "0";
        });
    }

    function updateProgressDots(currentIndex, total) {
        if (!progressEl) {
            return;
        }
        progressEl.innerHTML = "";

        for (let i = 0; i < total; i = i + 1) {
            const dot = document.createElement("div");
            dot.style.cssText = [
                "width:8px", "height:8px",
                "border-radius:50%",
                "transition:background 0.2s, transform 0.2s"
            ].join(";");

            if (i < currentIndex) {
                dot.style.background = "#10b981";
                dot.style.transform = "scale(1)";
            } else if (i === currentIndex) {
                dot.style.background = "#5fa8d3";
                dot.style.transform = "scale(1.3)";
                dot.style.boxShadow = "0 0 6px rgba(95,168,211,0.8)";
            } else {
                dot.style.background = "rgba(255,255,255,0.2)";
                dot.style.transform = "scale(1)";
            }

            progressEl.appendChild(dot);
        }
    }

    function updateStatusText(message) {
        const el = document.getElementById("calib-status-text");
        if (el) {
            el.textContent = message;
        }
    }

    async function captureOnePoint(px, py, pointIndex, totalPoints) {
        redoRequested = false;
        lastPointX = px;
        lastPointY = py;

        placeDotAt(px, py);
        dotRingEl.style.opacity = "1";
        updateProgressDots(pointIndex, totalPoints);
        updateStatusText("Point " + (pointIndex + 1) + " of " + totalPoints + " — look directly at the dot");
        if (redoBtnEl) {
            redoBtnEl.style.display = "none";
        }

        if (window.EventAPI) {
            EventAPI.emitCalibrationProgress({
                currentPoint: pointIndex + 1,
                totalPoints: totalPoints,
                phase: "capturing"
            });
        }

        await wait(SACCADE_MS);

        const samplesDuringDwell = Math.floor(POINT_DWELL_MS / 60);

        updateStatusText("Checking camera and gaze signal…");
        if (!await waitForUsableFaceAndGaze(5000)) {
            updateStatusText("Face not ready. Center your face, keep both eyes open, then look at the dot.");
            await wait(900);
            return { retry: true };
        }

        const samplesRecorded = await Promise.all([
            animateDotProgress(POINT_DWELL_MS, null),
            trainWebGazer(px, py, samplesDuringDwell)
        ]).then(function (values) { return values[1]; });

        await flashCaptureDone();
        await wait(180);

        if (redoBtnEl) {
            redoBtnEl.style.display = "block";
        }

        await wait(520);

        if (samplesRecorded < Math.max(4, Math.floor(samplesDuringDwell * 0.35))) {
            updateStatusText("Gaze signal was too weak at this point. Hold still and try it again.");
            return { retry: true };
        }

        const result = {
            pointIndex: pointIndex,
            px: px,
            py: py,
            samplesRecorded: samplesRecorded,
            score: Math.min(100, Math.round((samplesRecorded / samplesDuringDwell) * 100))
        };

        return result;
    }

    async function runCalibration(mode) {
        if (isCalibrating) {
            return inMemoryProfile;
        }
        isCalibrating = true;
        redoRequested = false;

        const points = (mode === "quick") ? FIVE_POINTS : NINE_POINTS;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        buildOverlay();

        await wait(500);

        const results = [];
        let i = 0;

        while (i < points.length) {
            const def = points[i];
            const px = Math.round(def.xPercent * viewportW);
            const py = Math.round(def.yPercent * viewportH);

            const result = await captureOnePoint(px, py, i, points.length);
            if (result.retry) {
                await wait(300);
                continue;
            }
            results[i] = result;

            if (redoRequested) {
                redoRequested = false;
                await wait(200);
            } else {
                i = i + 1;
            }
        }

        inMemoryProfile = {
            calibrated: true,
            timestamp: Date.now(),
            mode: mode,
            overallScore: Math.round(results.reduce(function (sum, result) {
                return sum + result.score;
            }, 0) / results.length),
            pointResults: results
        };

        updateStatusText("Calibration complete — starting baseline reading session…");
        updateProgressDots(points.length, points.length);
        if (redoBtnEl) {
            redoBtnEl.style.display = "none";
        }

        if (window.EventAPI) {
            EventAPI.emitCalibrationComplete(inMemoryProfile.overallScore, mode);
        }

        await wait(1200);

        removeOverlay();
        isCalibrating = false;

        return inMemoryProfile;
    }

    function runCalibrationSequence() {
        return runCalibration("full");
    }

    function runQuickRecalibration() {
        return runCalibration("quick");
    }

    function triggerRecalibration(reason) {
        return runCalibration("quick");
    }

    function getCalibrationProfile() {
        return inMemoryProfile;
    }

    function clearCalibrationProfile() {
        inMemoryProfile = {
            calibrated: false,
            timestamp: null,
            mode: "none",
            overallScore: 0,
            pointResults: []
        };
    }

    function isCalibratingNow() {
        return isCalibrating;
    }

    return {
        runCalibrationSequence: runCalibrationSequence,
        runQuickRecalibration: runQuickRecalibration,
        triggerRecalibration: triggerRecalibration,
        isCalibratingNow: isCalibratingNow,
        getCalibrationProfile: getCalibrationProfile,
        clearCalibrationProfile: clearCalibrationProfile
    };

})();

if (typeof window !== "undefined") {
    window.CalibrationUI = CalibrationUI;
}
