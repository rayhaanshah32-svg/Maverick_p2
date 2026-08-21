(function () {

    let cvInitialized = false;
    let demoSimulationInterval = null;
    let currentBaselineWPM = 215;
    let currentBaselineFixationMs = 240;

    function onDocumentLoaded(document, isDemoMode) {
        if (window.AdaptiveReaderCV) {
            setTimeout(function () {
                window.AdaptiveReaderCV.setTextRegion("#text-container");
            }, 200);
        }

        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.reset();
            window.ReadingIntelligence.initialize({
                documentWordCount: document.wordCount,
                documentLineCount: document.paragraphs.length
            });
        }

        if (isDemoMode) {
            startDemoSimulation();
        } else {
            stopDemoSimulation();
            initCVPipeline();
        }
    }

    function initCVPipeline() {
        if (cvInitialized) {
            if (window.AdaptiveReaderCV) {
                window.AdaptiveReaderCV.setTextRegion("#text-container");
            }
            AppUI.updateStatus("system", "good");
            AppUI.setCvStatus("ok", "warn", "warn");
            return;
        }

        AppUI.showCvLoadingBanner("Requesting camera access…");
        AppUI.setCvStatus("warn", "off", "off");

        if (!window.AdaptiveReaderCV) {
            AppUI.hideCvLoadingBanner();
            AppUI.updateStatus("system", "warning");
            console.warn("[Main] AdaptiveReaderCV not available.");
            return;
        }

        window.AdaptiveReaderCV.initialize(function (statusMessage) {
            AppUI.showCvLoadingBanner(statusMessage);
        }).then(function () {
            cvInitialized = true;
            AppUI.hideCvLoadingBanner();
            AppUI.updateStatus("system", "good");
            AppUI.setCvStatus("ok", "ok", "warn");
            AppUI.updateStatus("reading", "good");
        }).catch(function (error) {
            AppUI.hideCvLoadingBanner();
            AppUI.updateStatus("system", "warning");

            if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                AppUI.setCvStatus("warn", "off", "off");
                console.warn("[Main] Camera permission denied. Reading works without eye tracking.");
            } else if (error.name === "NotFoundError") {
                AppUI.setCvStatus("warn", "off", "off");
                console.warn("[Main] No camera found. Reading works without eye tracking.");
            } else {
                AppUI.setCvStatus("warn", "off", "off");
                console.warn("[Main] CV initialization error:", error.message);
            }
        });
    }

    function startDemoSimulation() {
        stopDemoSimulation();

        AppUI.updateStatus("system", "good");
        AppUI.updateStatus("reading", "good");
        AppUI.setCvStatus("off", "off", "off");

        let tick = 0;

        demoSimulationInterval = setInterval(function () {
            tick = tick + 1;

            const wpmVariation = (Math.random() - 0.5) * 60;
            const wpm = Math.max(80, currentBaselineWPM + wpmVariation);

            const fixationVariation = (Math.random() - 0.5) * 80;
            const fixationMs = Math.max(120, currentBaselineFixationMs + fixationVariation);

            const wpmRatio = wpm / currentBaselineWPM;
            const fixationRatio = fixationMs / currentBaselineFixationMs;
            let frictionScore = 0;

            if (wpmRatio < 0.75) {
                frictionScore = frictionScore + 30;
            } else if (wpmRatio < 0.90) {
                frictionScore = frictionScore + 15;
            }

            if (fixationRatio > 1.4) {
                frictionScore = frictionScore + 25;
            } else if (fixationRatio > 1.2) {
                frictionScore = frictionScore + 10;
            }

            frictionScore = Math.min(100, frictionScore + Math.random() * 10);

            AppUI.updateMetrics(wpm, fixationMs, frictionScore);

            if (tick === 10 && frictionScore < 45) {
                frictionScore = 50;
            }

            if (tick > 5 && frictionScore >= 45 && frictionScore < 65) {
                AppUI.showAdaptationPanel("MILD_FRICTION", frictionScore, ["reading_speed_slowdown"]);
                AppUI.updateStatus("reading", "warning");
            } else if (tick > 8 && frictionScore >= 65) {
                AppUI.showAdaptationPanel("HIGH_FRICTION", frictionScore, ["repeated_line_revisit", "prolonged_fixation"]);
                AppUI.updateStatus("reading", "error");
                stopDemoSimulation();
            }

        }, 1500);
    }

    function stopDemoSimulation() {
        if (demoSimulationInterval) {
            clearInterval(demoSimulationInterval);
            demoSimulationInterval = null;
        }
    }

    function onSessionReset() {
        stopDemoSimulation();

        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.reset();
        }

        AppUI.updateStatus("system", "idle");
        AppUI.updateStatus("reading", "idle");
        AppUI.setCvStatus("off", "off", "off");
    }

    function wireReadingIntelligenceEvents() {
        if (!window.ReadingIntelligence) {
            return;
        }

        window.ReadingIntelligence.on("onAdaptationRecommendation", function (data) {
            if (!AppUI.getIsDemoMode()) {
                AppUI.showAdaptationPanel(data.state, data.score, data.evidence);
            }
        });

        window.ReadingIntelligence.on("onReadingFrictionUpdate", function (data) {
            if (!AppUI.getIsDemoMode()) {
                const doc = AppUI.getCurrentDocument();
                if (doc) {
                    AppUI.updateMetrics(null, null, data.smoothedScore);
                }
            }
        });

        window.ReadingIntelligence.on("onReadingStateUpdate", function (data) {
            if (!AppUI.getIsDemoMode()) {
                AppUI.updateMetrics(data.currentWPM, data.fixationMs, data.smoothedScore);

                if (data.state === "FLOW") {
                    AppUI.updateStatus("reading", "good");
                } else if (data.state === "MILD_FRICTION") {
                    AppUI.updateStatus("reading", "warning");
                } else if (data.state === "HIGH_FRICTION" || data.state === "ASSIST") {
                    AppUI.updateStatus("reading", "error");
                }
            }
        });
    }

    function wireEventAPIEvents() {
        if (!window.EventAPI) {
            return;
        }

        window.EventAPI.on("onFaceQualityChange", function (data) {
            if (data.facePresent) {
                AppUI.setCvStatus("ok", "ok", "warn");
            } else {
                AppUI.setCvStatus("ok", "warn", "off");
            }
        });

        window.EventAPI.on("onGazeUpdate", function (data) {
            if (data.confidence > 0.5) {
                AppUI.setCvStatus("ok", "ok", "ok");
                AppUI.updateStatus("reading", "good");
            }
        });

        window.EventAPI.on("onSignalQualityUpdate", function (data) {
            if (data.score < 40) {
                AppUI.setCvStatus("ok", "warn", "warn");
            } else if (data.score < 70) {
                AppUI.setCvStatus("ok", "ok", "warn");
            } else {
                AppUI.setCvStatus("ok", "ok", "ok");
            }
        });

        window.EventAPI.on("onBaselineComplete", function (data) {
            currentBaselineWPM = data.baselineWPM || 215;
            currentBaselineFixationMs = data.baselineFixationMs || 240;
        });

        window.EventAPI.on("onCalibrationComplete", function () {
            AppUI.setCvStatus("ok", "ok", "ok");
        });

        window.EventAPI.on("onRecalibrationNeeded", function () {
            AppUI.setCvStatus("ok", "warn", "warn");
        });
    }

    function initialize() {
        AppUI.initialize();
        wireReadingIntelligenceEvents();
        wireEventAPIEvents();

        window.AdaptiveReaderApp = {
            onDocumentLoaded: onDocumentLoaded,
            onSessionReset: onSessionReset
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();