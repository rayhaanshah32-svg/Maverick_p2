const CalibrationUI = (function () {

    const DWELL_DURATION_MS = 1000;
    const SACCADE_DISCARD_MS = 300;
    const COLLECT_DURATION_MS = DWELL_DURATION_MS - SACCADE_DISCARD_MS;

    const VALIDATION_POINTS = 5;
    const ACCURACY_GOOD_THRESHOLD_PX = 100;

    const CALIBRATION_POINTS = [
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

    const VALIDATION_POINT_INDICES = [0, 2, 4, 6, 8];

    let overlayElement = null;
    let dotElement = null;
    let instructionElement = null;
    let progressElement = null;
    let isCalibrating = false;
    let collectedValidationErrors = [];

    function createOverlay() {
        overlayElement = document.createElement("div");
        overlayElement.id = "calibration-overlay";
        overlayElement.style.position = "fixed";
        overlayElement.style.top = "0";
        overlayElement.style.left = "0";
        overlayElement.style.width = "100vw";
        overlayElement.style.height = "100vh";
        overlayElement.style.backgroundColor = "rgba(10, 10, 20, 0.97)";
        overlayElement.style.zIndex = "99999";
        overlayElement.style.display = "flex";
        overlayElement.style.flexDirection = "column";
        overlayElement.style.alignItems = "center";
        overlayElement.style.justifyContent = "center";
        overlayElement.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";

        instructionElement = document.createElement("div");
        instructionElement.id = "calibration-instruction";
        instructionElement.style.position = "absolute";
        instructionElement.style.top = "20px";
        instructionElement.style.left = "50%";
        instructionElement.style.transform = "translateX(-50%)";
        instructionElement.style.color = "#e0e0ff";
        instructionElement.style.fontSize = "18px";
        instructionElement.style.textAlign = "center";
        instructionElement.style.letterSpacing = "0.04em";
        instructionElement.style.userSelect = "none";

        progressElement = document.createElement("div");
        progressElement.id = "calibration-progress";
        progressElement.style.position = "absolute";
        progressElement.style.bottom = "24px";
        progressElement.style.left = "50%";
        progressElement.style.transform = "translateX(-50%)";
        progressElement.style.color = "#888aaa";
        progressElement.style.fontSize = "14px";
        progressElement.style.userSelect = "none";

        dotElement = document.createElement("div");
        dotElement.id = "calibration-dot";
        dotElement.style.position = "absolute";
        dotElement.style.width = "28px";
        dotElement.style.height = "28px";
        dotElement.style.borderRadius = "50%";
        dotElement.style.backgroundColor = "#5c6bc0";
        dotElement.style.border = "3px solid #9fa8da";
        dotElement.style.boxShadow = "0 0 18px rgba(92, 107, 192, 0.8)";
        dotElement.style.transition = "transform 0.18s ease, background-color 0.2s ease, box-shadow 0.2s ease";
        dotElement.style.transform = "translate(-50%, -50%) scale(1)";
        dotElement.style.display = "none";

        overlayElement.appendChild(instructionElement);
        overlayElement.appendChild(progressElement);
        overlayElement.appendChild(dotElement);
        document.body.appendChild(overlayElement);
    }

    function moveDotToPoint(targetX, targetY) {
        dotElement.style.display = "block";
        dotElement.style.left = targetX + "px";
        dotElement.style.top = targetY + "px";
        dotElement.style.backgroundColor = "#5c6bc0";
        dotElement.style.boxShadow = "0 0 18px rgba(92, 107, 192, 0.8)";
        dotElement.style.transform = "translate(-50%, -50%) scale(1)";
    }

    function animateDotCollection(targetX, targetY, durationMs, onComplete) {
        let startTime = null;
        const totalDuration = durationMs;

        function animationStep(currentTime) {
            if (!startTime) {
                startTime = currentTime;
            }
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / totalDuration, 1);

            const scale = 1 + progress * 0.5;
            const greenAmount = Math.round(progress * 130);
            const redAmount = 92 + Math.round(progress * 20);
            const blueAmount = 192 - Math.round(progress * 80);

            dotElement.style.backgroundColor =
                "rgb(" + redAmount + ", " + (107 + greenAmount) + ", " + blueAmount + ")";
            dotElement.style.transform =
                "translate(-50%, -50%) scale(" + scale + ")";
            dotElement.style.boxShadow =
                "0 0 " + (18 + Math.round(progress * 20)) + "px rgba(92, 200, 100, " + (0.6 + progress * 0.4) + ")";

            if (progress < 1) {
                requestAnimationFrame(animationStep);
            } else {
                onComplete();
            }
        }

        requestAnimationFrame(animationStep);
    }

    function flashDotSuccess() {
        dotElement.style.backgroundColor = "#4caf50";
        dotElement.style.boxShadow = "0 0 32px rgba(76, 175, 80, 1)";
        dotElement.style.transform = "translate(-50%, -50%) scale(1.6)";

        setTimeout(function () {
            dotElement.style.transform = "translate(-50%, -50%) scale(0)";
            setTimeout(function () {
                dotElement.style.display = "none";
            }, 200);
        }, 180);
    }

    async function calibrateSinglePoint(targetX, targetY, pointNumber, totalPoints) {
        moveDotToPoint(targetX, targetY);

        instructionElement.textContent = "Look at the dot";
        progressElement.textContent = "Point " + pointNumber + " of " + totalPoints;

        EventAPI.emitCalibrationProgress({
            currentPoint: pointNumber,
            totalPoints: totalPoints,
            phase: "calibrating"
        });

        await wait(SACCADE_DISCARD_MS);

        webgazer.recordScreenPosition(targetX, targetY, "click");

        await new Promise(function (resolve) {
            animateDotCollection(targetX, targetY, COLLECT_DURATION_MS, resolve);
        });

        for (let i = 0; i < 5; i++) {
            webgazer.recordScreenPosition(targetX, targetY, "click");
            await wait(60);
        }

        flashDotSuccess();
        await wait(320);
    }

    async function validateSinglePoint(targetX, targetY, pointNumber) {
        moveDotToPoint(targetX, targetY);
        dotElement.style.backgroundColor = "#e91e63";
        dotElement.style.boxShadow = "0 0 18px rgba(233, 30, 99, 0.8)";

        instructionElement.textContent = "Look at the dot — validation";
        progressElement.textContent = "Validation " + pointNumber + " of " + VALIDATION_POINTS;

        await wait(SACCADE_DISCARD_MS);

        const samples = [];
        const collectEndTime = Date.now() + COLLECT_DURATION_MS;

        while (Date.now() < collectEndTime) {
            const prediction = await webgazer.getCurrentPrediction();
            if (prediction) {
                samples.push({ x: prediction.x, y: prediction.y });
            }
            await wait(50);
        }

        if (samples.length === 0) {
            return null;
        }

        let sumX = 0;
        let sumY = 0;
        for (let i = 0; i < samples.length; i++) {
            sumX += samples[i].x;
            sumY += samples[i].y;
        }
        const averageX = sumX / samples.length;
        const averageY = sumY / samples.length;

        const errorDistance = Math.sqrt(
            Math.pow(averageX - targetX, 2) +
            Math.pow(averageY - targetY, 2)
        );

        flashDotSuccess();
        await wait(300);

        return errorDistance;
    }

    function computeAccuracyScore(errorDistances) {
        const validErrors = errorDistances.filter(function (error) {
            return error !== null;
        });

        if (validErrors.length === 0) {
            return 0;
        }

        const averageError = validErrors.reduce(function (sum, error) {
            return sum + error;
        }, 0) / validErrors.length;

        const score = Math.max(0, Math.min(100, 100 - (averageError / ACCURACY_GOOD_THRESHOLD_PX) * 50));

        return parseFloat(score.toFixed(1));
    }

    async function runCalibrationSequence() {
        if (isCalibrating) {
            return;
        }
        isCalibrating = true;

        createOverlay();
        instructionElement.textContent = "Eye Tracking Calibration — Follow the dot with your eyes";
        await wait(1800);

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        for (let i = 0; i < CALIBRATION_POINTS.length; i++) {
            const point = CALIBRATION_POINTS[i];
            const pixelX = Math.round(point.xPercent * viewportWidth);
            const pixelY = Math.round(point.yPercent * viewportHeight);

            await calibrateSinglePoint(pixelX, pixelY, i + 1, CALIBRATION_POINTS.length);
            await wait(150);
        }

        instructionElement.textContent = "Calibration complete — now validating accuracy…";
        await wait(700);

        const errorDistances = [];

        for (let i = 0; i < VALIDATION_POINT_INDICES.length; i++) {
            const point = CALIBRATION_POINTS[VALIDATION_POINT_INDICES[i]];
            const pixelX = Math.round(point.xPercent * viewportWidth);
            const pixelY = Math.round(point.yPercent * viewportHeight);

            const error = await validateSinglePoint(pixelX, pixelY, i + 1);
            errorDistances.push(error);
        }

        const accuracyScore = computeAccuracyScore(errorDistances);

        if (accuracyScore < 40) {
            instructionElement.textContent =
                "Accuracy was low (" + accuracyScore + "/100) — retrying calibration…";
            progressElement.textContent = "";
            await wait(1800);

            removeOverlay();
            isCalibrating = false;

            await runCalibrationSequence();
            return;
        }

        instructionElement.textContent =
            "Calibration successful — accuracy score: " + accuracyScore + " / 100";
        progressElement.textContent = "";
        await wait(1600);

        removeOverlay();
        isCalibrating = false;

        EventAPI.emitCalibrationComplete(accuracyScore);
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

    function triggerRecalibration(reason) {
        if (!isCalibrating) {
            runCalibrationSequence();
        }
    }

    return {
        runCalibrationSequence: runCalibrationSequence,
        triggerRecalibration: triggerRecalibration
    };

})();
