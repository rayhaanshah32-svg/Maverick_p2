const AdaptiveReaderCV = (function () {

    let isInitialized = false;

    async function initialize(statusCallback) {
        if (isInitialized) {
            return;
        }

        function updateStatus(message) {
            if (typeof statusCallback === "function") {
                statusCallback(message);
            }
        }

        updateStatus("Requesting webcam access…");
        console.log("[AdaptiveReaderCV] Starting initialization…");

        const cameraStream = await CameraManager.startCamera();
        console.log("[AdaptiveReaderCV] Camera stream acquired.");

        const videoElement = CameraManager.getVideoElement();

        updateStatus("Loading Face Landmarker…");
        console.log("[AdaptiveReaderCV] Waiting for MediaPipe module globals…");
        await window.mediapipeReadyPromise;

        if (window.Module) {
            delete window.Module;
        }

        await MediaPipeEngine.initialize();
        console.log("[AdaptiveReaderCV] MediaPipe Face Landmarker ready.");

        if (window.Module) {
            delete window.Module;
        }

        updateStatus("Initializing WebGazer eye tracker…");
        await setupWebGazer(videoElement, cameraStream);
        console.log("[AdaptiveReaderCV] WebGazer ready.");

        MediaPipeEngine.start(videoElement);

        GazePipeline.start();
        console.log("[AdaptiveReaderCV] Gaze pipeline started at", GazePipeline.OUTPUT_RATE_HZ, "Hz.");

        DOMMapper.refreshOnResize();

        EventAPI.on("onRecalibrationNeeded", function (eventData) {
            console.log("[AdaptiveReaderCV] Recalibration triggered:", eventData.reason);
            CalibrationUI.triggerRecalibration(eventData.reason);
        });

        setupKeyboardShortcuts();

        isInitialized = true;

        EventAPI.emitSystemReady();
        await startCalibration();
        console.log("[AdaptiveReaderCV] System fully initialized.");
    }

    async function setupWebGazer(videoElement, cameraStream) {
        webgazer.params.showVideoPreview = false;
        webgazer.params.showPredictionPoints = false;
        webgazer.params.saveDataAcrossSessions = false;
        webgazer.params.applyKalmanFilter = false;
        webgazer.params.showGazeDot = false;
        webgazer.params.faceMeshSolutionPath = "./mediapipe/face_mesh";
        webgazer.setStaticVideo(cameraStream);

        webgazer.setGazeListener(function (gazeData, elapsedTime) {
            GazePipeline.handleIncomingWebGazerPoint(gazeData, elapsedTime);
        });

        await webgazer.begin();

        webgazer.showVideo(false);
        webgazer.showFaceOverlay(false);
        webgazer.showFaceFeedbackBox(false);
    }

    function setupKeyboardShortcuts() {
        window.addEventListener("keydown", function (event) {
            if (event.key === "r" || event.key === "R") {
                console.log("[HotKey] 'R' pressed -> Quick Recalibration");
                triggerQuickRecalibration();
            } else if (event.key === "c" || event.key === "C") {
                console.log("[HotKey] 'C' pressed -> Full 9-Point Calibration");
                startCalibration();
            } else if (event.key === "d" || event.key === "D") {
                console.log("[HotKey] 'D' pressed -> Toggle Debug Panel");
                if (typeof window.toggleDebugPanel === "function") {
                    window.toggleDebugPanel();
                }
            } else if (event.key === "o" || event.key === "O") {
                console.log("[HotKey] 'O' pressed -> Toggle AOI Overlay");
                toggleAOIDebugOverlay();
            } else if (event.key === "b" || event.key === "B") {
                console.log("[HotKey] 'B' pressed -> Start Baseline");
                startBaseline();
            } else if (event.key === "s" || event.key === "S") {
                console.log("[HotKey] 'S' pressed -> Fast Skip Baseline");
                skipBaselineWithDefaults();
            } else if (event.key === "h" || event.key === "H") {
                console.log("[HotKey] 'H' pressed -> Toggle Demo Mode");
                toggleDemoMode();
            }
        });
    }

    function toggleDemoMode() {
        const headerControls = document.getElementById("header-controls");
        if (headerControls) {
            headerControls.classList.toggle("demo-mode-clean");
        }
    }

    async function startCalibration() {
        await CalibrationUI.runCalibrationSequence();
    }

    async function triggerQuickRecalibration() {
        GazePipeline.resetDriftTracking();
        await CalibrationUI.runQuickRecalibration();
    }

    function startBaseline() {
        BaselineCapture.startBaseline();
    }

    function skipBaselineWithDefaults() {
        BaselineCapture.skipBaselineWithDefaults();
    }

    function triggerManualRecalibration() {
        CalibrationUI.triggerRecalibration("manual");
        GazePipeline.resetDriftTracking();
    }

    function setTextRegion(containerSelector) {
        DOMMapper.setTextContainer(containerSelector);
    }

    function refreshTextRegion() {
        DOMMapper.rebuildBoundingBoxCache();
    }

    function toggleAOIDebugOverlay(state) {
        return DOMMapper.toggleDebugOverlay(state);
    }

    function getCalibrationProfile() {
        return CalibrationUI.getCalibrationProfile();
    }

    function clearCalibrationProfile() {
        CalibrationUI.clearCalibrationProfile();
    }

    function setSmoothingWindowMs(ms) {
        GazePipeline.setSmoothingWindowMs(ms);
    }

    function getSmoothingWindowMs() {
        return GazePipeline.getSmoothingWindowMs();
    }

    return {
        initialize: initialize,
        startCalibration: startCalibration,
        triggerQuickRecalibration: triggerQuickRecalibration,
        startBaseline: startBaseline,
        skipBaselineWithDefaults: skipBaselineWithDefaults,
        triggerManualRecalibration: triggerManualRecalibration,
        toggleAOIDebugOverlay: toggleAOIDebugOverlay,
        getCalibrationProfile: getCalibrationProfile,
        clearCalibrationProfile: clearCalibrationProfile,
        setSmoothingWindowMs: setSmoothingWindowMs,
        getSmoothingWindowMs: getSmoothingWindowMs,
        setTextRegion: setTextRegion,
        refreshTextRegion: refreshTextRegion,
        on: EventAPI.on,
        off: EventAPI.off
    };

})();
if (typeof window !== "undefined") {
  window.AdaptiveReaderCV = AdaptiveReaderCV;
}
