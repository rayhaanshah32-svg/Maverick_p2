const CalibrationUI = (function () {

    const FULL_DWELL_MS = 1000;
    const FULL_SACCADE_MS = 250;

    const QUICK_DWELL_MS = 750;
    const QUICK_SACCADE_MS = 200;

    const ACCURACY_THRESHOLD_PX = 100;

    const NINE_POINTS = [
        { xPercent: 0.1,  yPercent: 0.1  },
        { xPercent: 0.5,  yPercent: 0.1  },
        { xPercent: 0.9,  yPercent: 0.1  },
        { xPercent: 0.1,  yPercent: 0.5  },
        { xPercent: 0.5,  yPercent: 0.5  },
        { xPercent: 0.9,  yPercent: 0.5  },
        { xPercent: 0.1,  yPercent: 0.9  },
        { xPercent: 0.5,  yPercent: 0.9  },
        { xPercent: 0.9,  yPercent: 0.9  }
    ];

    const FIVE_POINTS = [
        { xPercent: 0.1,  yPercent: 0.1  },
        { xPercent: 0.9,  yPercent: 0.1  },
        { xPercent: 0.5,  yPercent: 0.5  },
        { xPercent: 0.1,  yPercent: 0.9  },
        { xPercent: 0.9,  yPercent: 0.9  }
    ];

    let overlayElement = null;
    let dotContainer = null;
    let dotPulseRing = null;
    let dotCore = null;
    let dotProgressRing = null;
    let instructionElement = null;
    let statusBannerElement = null;
    let qualityBadgeElement = null;

    let isCalibrating = false;
    let currentMode = "full";

    let inMemoryProfile = {
        calibrated: false,
        timestamp: null,
        mode: "none",
        overallScore: 0,
        averageErrorPx: 0,
        pointResults: []
    };

    function createOverlay() {
        overlayElement = document.createElement("div");
        overlayElement.id = "calibration-overlay";
        overlayElement.style.position = "fixed";
        overlayElement.style.top = "0";
        overlayElement.style.left = "0";
        overlayElement.style.width = "100vw";
        overlayElement.style.height = "100vh";
        overlayElement.style.backgroundColor = "rgba(7, 8, 16, 0.96)";
        overlayElement.style.backdropFilter = "blur(12px)";
        overlayElement.style.zIndex = "99999";
        overlayElement.style.display = "flex";
        overlayElement.style.flexDirection = "column";
        overlayElement.style.alignItems = "center";
        overlayElement.style.justifyContent = "space-between";
        overlayElement.style.padding = "32px 20px";
        overlayElement.style.boxSizing = "border-box";
        overlayElement.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";

        const topHeader = document.createElement("div");
        topHeader.style.display = "flex";
        topHeader.style.flexDirection = "column";
        topHeader.style.alignItems = "center";
        topHeader.style.gap = "8px";

        instructionElement = document.createElement("div");
        instructionElement.id = "calibration-instruction";
        instructionElement.style.color = "#f0f2ff";
        instructionElement.style.fontSize = "22px";
        instructionElement.style.fontWeight = "600";
        instructionElement.style.letterSpacing = "0.02em";
        instructionElement.style.textAlign = "center";
        topHeader.appendChild(instructionElement);

        statusBannerElement = document.createElement("div");
        statusBannerElement.id = "calibration-status-banner";
        statusBannerElement.style.color = "#9fa3c0";
        statusBannerElement.style.fontSize = "14px";
        statusBannerElement.style.textAlign = "center";
        topHeader.appendChild(statusBannerElement);

        overlayElement.appendChild(topHeader);

        dotContainer = document.createElement("div");
        dotContainer.id = "calibration-dot-container";
        dotContainer.style.position = "absolute";
        dotContainer.style.width = "80px";
        dotContainer.style.height = "80px";
        dotContainer.style.transform = "translate(-50%, -50%)";
        dotContainer.style.display = "none";
        dotContainer.style.pointerEvents = "none";

        dotPulseRing = document.createElement("div");
        dotPulseRing.id = "calibration-pulse-ring";
        dotPulseRing.style.position = "absolute";
        dotPulseRing.style.inset = "0";
        dotPulseRing.style.borderRadius = "50%";
        dotPulseRing.style.border = "2px solid rgba(92, 107, 192, 0.6)";
        dotPulseRing.style.boxShadow = "0 0 20px rgba(92, 107, 192, 0.4)";
        dotPulseRing.style.animation = "calib-pulse 1.4s ease-out infinite";
        dotContainer.appendChild(dotPulseRing);

        dotCore = document.createElement("div");
        dotCore.id = "calibration-dot-core";
        dotCore.style.position = "absolute";
        dotCore.style.top = "50%";
        dotCore.style.left = "50%";
        dotCore.style.width = "26px";
        dotCore.style.height = "26px";
        dotCore.style.borderRadius = "50%";
        dotCore.style.transform = "translate(-50%, -50%) scale(1)";
        dotCore.style.backgroundColor = "#5c6bc0";
        dotCore.style.border = "3px solid #e0e7ff";
        dotCore.style.boxShadow = "0 0 16px rgba(92, 107, 192, 0.9)";
        dotCore.style.transition = "transform 0.15s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease";
        dotContainer.appendChild(dotCore);

        overlayElement.appendChild(dotContainer);

        const bottomFooter = document.createElement("div");
        bottomFooter.style.display = "flex";
        bottomFooter.style.alignItems = "center";
        bottomFooter.style.gap = "16px";

        qualityBadgeElement = document.createElement("div");
        qualityBadgeElement.id = "calibration-quality-badge";
        qualityBadgeElement.style.padding = "8px 18px";
        qualityBadgeElement.style.borderRadius = "20px";
        qualityBadgeElement.style.backgroundColor = "rgba(26, 29, 53, 0.85)";
        qualityBadgeElement.style.border = "1px solid rgba(92, 107, 192, 0.3)";
        qualityBadgeElement.style.color = "#c7d2fe";
        qualityBadgeElement.style.fontSize = "13px";
        qualityBadgeElement.style.fontWeight = "500";
        bottomFooter.appendChild(qualityBadgeElement);

        overlayElement.appendChild(bottomFooter);

        if (!document.getElementById("calibration-animations-style")) {
            const styleTag = document.createElement("style");
            styleTag.id = "calibration-animations-style";
            styleTag.textContent = `
                @keyframes calib-pulse {
                    0% { transform: scale(0.6); opacity: 1; }
                    100% { transform: scale(1.6); opacity: 0; }
                }
                @keyframes calib-capture-spin {
                    0% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(0.6); }
                    100% { transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(styleTag);
        }

        document.body.appendChild(overlayElement);
    }

    function moveDot(pixelX, pixelY) {
        dotContainer.style.display = "block";
        dotContainer.style.left = pixelX + "px";
        dotContainer.style.top = pixelY + "px";

        dotCore.style.backgroundColor = "#5c6bc0";
        dotCore.style.borderColor = "#e0e7ff";
        dotCore.style.boxShadow = "0 0 16px rgba(92, 107, 192, 0.9)";
        dotCore.style.transform = "translate(-50%, -50%) scale(1)";
        dotPulseRing.style.borderColor = "rgba(92, 107, 192, 0.6)";
        dotPulseRing.style.display = "block";
    }

    function animateCapture(durationMs, onComplete) {
        let startTime = null;

        dotPulseRing.style.borderColor = "rgba(16, 185, 129, 0.8)";
        dotPulseRing.style.boxShadow = "0 0 24px rgba(16, 185, 129, 0.6)";

        function step(timestamp) {
            if (!startTime) {
                startTime = timestamp;
            }
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / durationMs, 1);

            const scale = 1.2 - (progress * 0.5);

            const red = Math.round(92 + (16 - 92) * progress);
            const green = Math.round(107 + (185 - 107) * progress);
            const blue = Math.round(192 + (129 - 192) * progress);

            dotCore.style.backgroundColor = "rgb(" + red + ", " + green + ", " + blue + ")";
            dotCore.style.borderColor = "#a7f3d0";
            dotCore.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
            dotCore.style.boxShadow = "0 0 " + (16 + Math.round(progress * 18)) + "px rgba(16, 185, 129, 0.9)";

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                onComplete();
            }
        }

        requestAnimationFrame(step);
    }

    function flashSuccess() {
        dotCore.style.backgroundColor = "#10b981";
        dotCore.style.borderColor = "#ffffff";
        dotCore.style.boxShadow = "0 0 36px rgba(16, 185, 129, 1)";
        dotCore.style.transform = "translate(-50%, -50%) scale(1.6)";

        setTimeout(function () {
            dotCore.style.transform = "translate(-50%, -50%) scale(0)";
            setTimeout(function () {
                dotContainer.style.display = "none";
            }, 150);
        }, 160);
    }

    function calculatePointAccuracy(targetX, targetY, predictions) {
        if (!predictions || predictions.length === 0) {
            return { errorPx: 80, score: 60 };
        }

        let totalX = 0;
        let totalY = 0;
        for (let i = 0; i < predictions.length; i++) {
            totalX += predictions[i].x;
            totalY += predictions[i].y;
        }

        const avgX = totalX / predictions.length;
        const avgY = totalY / predictions.length;

        const distance = Math.sqrt(
            Math.pow(avgX - targetX, 2) + Math.pow(avgY - targetY, 2)
        );

        const score = Math.max(0, Math.min(100, 100 - (distance / ACCURACY_THRESHOLD_PX) * 50));

        return {
            errorPx: distance,
            score: parseFloat(score.toFixed(1))
        };
    }

    async function calibrateSinglePoint(targetX, targetY, pointNumber, totalPoints, saccadeMs, dwellMs) {
        moveDot(targetX, targetY);

        instructionElement.textContent = "Focus on the center dot";
        statusBannerElement.textContent = "Point " + pointNumber + " of " + totalPoints + " — keep head steady";

        EventAPI.emitCalibrationProgress({
            currentPoint: pointNumber,
            totalPoints: totalPoints,
            phase: "capturing"
        });

        await wait(saccadeMs);

        webgazer.recordScreenPosition(targetX, targetY, "click");

        const collectTimeMs = dwellMs - saccadeMs;

        await new Promise(function (resolve) {
            animateCapture(collectTimeMs, resolve);
        });

        const checkSamples = [];
        for (let i = 0; i < 6; i++) {
            webgazer.recordScreenPosition(targetX, targetY, "click");
            const pred = await webgazer.getCurrentPrediction();
            if (pred) {
                checkSamples.push({ x: pred.x, y: pred.y });
            }
            await wait(45);
        }

        const pointQuality = calculatePointAccuracy(targetX, targetY, checkSamples);

        flashSuccess();
        await wait(240);

        return {
            pointNumber: pointNumber,
            targetX: targetX,
            targetY: targetY,
            errorPx: pointQuality.errorPx,
            score: pointQuality.score
        };
    }

    async function runCalibration(mode) {
        if (isCalibrating) {
            return;
        }
        isCalibrating = true;
        currentMode = mode || "full";

        const points = currentMode === "quick" ? FIVE_POINTS : NINE_POINTS;
        const dwellMs = currentMode === "quick" ? QUICK_DWELL_MS : FULL_DWELL_MS;
        const saccadeMs = currentMode === "quick" ? QUICK_SACCADE_MS : FULL_SACCADE_MS;

        createOverlay();

        const modeTitle = currentMode === "quick" ? "Quick Recalibration (5 Points)" : "Full 9-Point Calibration";
        instructionElement.textContent = modeTitle;
        statusBannerElement.textContent = "Follow each target dot with your eyes. Move eyes only, keep head still.";
        qualityBadgeElement.textContent = "Live Quality: Estimating…";

        console.log("[Calibration] Starting " + modeTitle + "…");
        await wait(1400);

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const results = [];

        for (let i = 0; i < points.length; i++) {
            const pointDef = points[i];
            const pixelX = Math.round(pointDef.xPercent * viewportWidth);
            const pixelY = Math.round(pointDef.yPercent * viewportHeight);

            const result = await calibrateSinglePoint(
                pixelX,
                pixelY,
                i + 1,
                points.length,
                saccadeMs,
                dwellMs
            );

            results.push(result);

            let totalScore = 0;
            for (let j = 0; j < results.length; j++) {
                totalScore += results[j].score;
            }
            const runningAvgScore = parseFloat((totalScore / results.length).toFixed(1));

            qualityBadgeElement.textContent =
                "Point " + (i + 1) + "/" + points.length +
                " Score: " + result.score + "% | Running Avg: " + runningAvgScore + "%";

            console.log(
                "[Calibration] Point " + (i + 1) + "/" + points.length +
                " -> Error: " + Math.round(result.errorPx) + "px" +
                ", Accuracy: " + result.score + "%" +
                ", Running Avg: " + runningAvgScore + "%"
            );

            EventAPI.emitCalibrationQualityLive({
                currentPoint: i + 1,
                totalPoints: points.length,
                pointAccuracy: result.score,
                overallAccuracy: runningAvgScore,
                phase: "calibrating",
                mode: currentMode
            });

            await wait(120);
        }

        let sumErrors = 0;
        let sumScores = 0;
        for (let i = 0; i < results.length; i++) {
            sumErrors += results[i].errorPx;
            sumScores += results[i].score;
        }
        const finalAvgError = Math.round(sumErrors / results.length);
        const finalAvgScore = parseFloat((sumScores / results.length).toFixed(1));

        inMemoryProfile = {
            calibrated: true,
            timestamp: Date.now(),
            mode: currentMode,
            overallScore: finalAvgScore,
            averageErrorPx: finalAvgError,
            pointResults: results
        };

        instructionElement.textContent = "Calibration Complete!";
        statusBannerElement.textContent = "Final Accuracy Score: " + finalAvgScore + " / 100 (Avg Error: " + finalAvgError + "px)";
        qualityBadgeElement.textContent = "Overall Accuracy: " + finalAvgScore + "%";

        console.log(
            "[Calibration] Completed " + modeTitle +
            " -> Final Score: " + finalAvgScore + "/100" +
            ", Avg Error: " + finalAvgError + "px"
        );

        await wait(1400);

        removeOverlay();
        isCalibrating = false;

        EventAPI.emitCalibrationComplete(finalAvgScore, currentMode);
    }

    function removeOverlay() {
        if (overlayElement && overlayElement.parentNode) {
            overlayElement.parentNode.removeChild(overlayElement);
            overlayElement = null;
        }
    }

    function wait(milliseconds) {
        return new Promise(function (resolve) {
            setTimeout(resolve, milliseconds);
        });
    }

    function runCalibrationSequence() {
        return runCalibration("full");
    }

    function runQuickRecalibration() {
        return runCalibration("quick");
    }

    function triggerRecalibration(reason) {
        if (!isCalibrating) {
            console.log("[Calibration] Recalibration triggered. Reason:", reason);
            if (reason === "quick" || reason === "head_pose_out_of_range" || reason === "gaze_drift_detected") {
                runQuickRecalibration();
            } else {
                runCalibrationSequence();
            }
        }
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
            averageErrorPx: 0,
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
        getCalibrationProfile: getCalibrationProfile,
        clearCalibrationProfile: clearCalibrationProfile,
        isCalibratingNow: isCalibratingNow
    };

})();
