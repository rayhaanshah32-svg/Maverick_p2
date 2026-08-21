const AdaptiveReaderCV = (function () {

    let isInitialized = false;
    let webgazerIsReady = false;
    let mediapipeIsReady = false;

    async function initialize() {
        if (isInitialized) {
            return;
        }

        console.log("[AdaptiveReaderCV] Starting initialization…");

        await CameraManager.startCamera();
        console.log("[AdaptiveReaderCV] Camera stream acquired.");

        const videoElement = CameraManager.getVideoElement();

        await setupWebGazer(videoElement);
        console.log("[AdaptiveReaderCV] WebGazer ready.");

        console.log("[AdaptiveReaderCV] Waiting for MediaPipe module globals…");
        await window.mediapipeReadyPromise;

        await MediaPipeEngine.initialize();
        console.log("[AdaptiveReaderCV] MediaPipe Face Landmarker ready.");

        MediaPipeEngine.start(videoElement);

        GazePipeline.start();
        console.log("[AdaptiveReaderCV] Gaze pipeline started at", GazePipeline.OUTPUT_RATE_HZ, "Hz.");

        DOMMapper.refreshOnResize();

        EventAPI.on("onRecalibrationNeeded", function (eventData) {
            console.log("[AdaptiveReaderCV] Recalibration triggered:", eventData.reason);
            CalibrationUI.triggerRecalibration(eventData.reason);
        });

        isInitialized = true;

        EventAPI.emitSystemReady();
        console.log("[AdaptiveReaderCV] System fully initialized.");
    }

    async function setupWebGazer(videoElement) {
        webgazer.params.showVideoPreview = false;
        webgazer.params.showPredictionPoints = false;
        webgazer.params.saveDataAcrossSessions = false;
        webgazer.params.applyKalmanFilter = false;
        webgazer.params.showGazeDot = false;

        webgazer.params.videoElement = videoElement;

        webgazer.setGazeListener(function (gazeData, elapsedTime) {
            GazePipeline.handleIncomingWebGazerPoint(gazeData, elapsedTime);
        });

        await webgazer.begin();

        webgazer.showVideo(false);
        webgazer.showFaceOverlay(false);
        webgazer.showFaceFeedbackBox(false);
    }

    async function startCalibration() {
        await CalibrationUI.runCalibrationSequence();
    }

    function startBaseline() {
        BaselineCapture.startBaseline();
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

    return {
        initialize: initialize,
        startCalibration: startCalibration,
        startBaseline: startBaseline,
        triggerManualRecalibration: triggerManualRecalibration,
        setTextRegion: setTextRegion,
        refreshTextRegion: refreshTextRegion,
        on: EventAPI.on,
        off: EventAPI.off
    };

})();
