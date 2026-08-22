(function () {

    let cvInitialized = false;
    let adaptationCooldownUntil = 0;
    const ADAPTATION_COOLDOWN_MS = 8000;

    function onDocumentLoaded(document, isDemoMode) {
        setTimeout(function () {
            if (window.DOMMapper) {
                window.DOMMapper.setTextContainer("#text-container");
            }
        }, 350);

        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.reset();
        }

        if (window.DifficultyEngine) {
            window.DifficultyEngine.reset();
        }

        if (isDemoMode) {
            if (window.ReadingIntelligence) {
                window.ReadingIntelligence.initialize({
                    documentWordCount: document.wordCount,
                    documentLineCount: document.paragraphs.length
                });
                window.ReadingIntelligence.start();
            }
            setupDemoMouseTracking();
        } else if (!cvInitialized) {
            initLiveCV();
        }
    }

    function initLiveCV() {
        if (!window.AdaptiveReaderCV) {
            return;
        }

        AppUI.updateCVStatus("Requesting webcam access…");

        window.AdaptiveReaderCV.initialize(function (statusMessage) {
            AppUI.updateCVStatus(statusMessage);
        }).then(function () {
            cvInitialized = true;
            AppUI.onCVReady();

            if (window.ReadingIntelligence) {
                window.ReadingIntelligence.initialize();
            }

        }).catch(function (error) {
            AppUI.onCVError(error);
            skipToDefaultBaseline();
        });
    }

    function skipToDefaultBaseline() {
        if (window.AdaptiveReaderCV && window.AdaptiveReaderCV.skipBaselineWithDefaults) {
            window.AdaptiveReaderCV.skipBaselineWithDefaults();
        }
        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.initialize();
            window.ReadingIntelligence.start();
        }
    }

    function setupDemoMouseTracking() {
        const textContainer = document.getElementById("text-container");
        if (!textContainer) {
            return;
        }

        textContainer.addEventListener("mousemove", function (event) {
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            if (window.DOMMapper) {
                const lineInfo = window.DOMMapper.findLineAtPoint(mouseX, mouseY);
                if (lineInfo && lineInfo.lineIndex >= 0) {
                    const gazePayload = {
                        x: mouseX,
                        y: mouseY,
                        rawX: mouseX,
                        rawY: mouseY,
                        lineIndex: lineInfo.lineIndex,
                        localLineIndex: lineInfo.localLineIndex !== undefined ? lineInfo.localLineIndex : -1,
                        paragraphIndex: lineInfo.paragraphIndex,
                        aoi: lineInfo.aoi || null,
                        confidence: 0.95,
                        timestamp: Date.now()
                    };

                    AppUI.onGaze(gazePayload);

                    if (window.EventAPI) {
                        EventAPI.emitGazeUpdate(gazePayload);
                    }
                }
            }
        });

        AppUI.updateSignalQuality({
            score: 88,
            breakdown: { face: 30, gaze: 32, blink: 26 }
        });
        AppUI.onFaceChange({
            facePresent: true,
            headPose: { yaw: 1, pitch: -2 }
        });

        if (window.EventAPI) {
            EventAPI.emitFaceQualityChange({
                facePresent: true,
                headPose: { yaw: 1, pitch: -2 },
                blinkState: false
            });
            EventAPI.emitSignalQualityUpdate({
                score: 88,
                level: "good",
                breakdown: { face: 30, gaze: 32, blink: 26 }
            });
        }
    }

    function onSessionReset() {
        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.reset();
        }
        if (window.DifficultyEngine) {
            window.DifficultyEngine.reset();
        }
        adaptationCooldownUntil = 0;
    }

    function handleMetricsReady(metrics) {
        if (!window.DifficultyEngine) {
            return;
        }

        const difficultyResult = window.DifficultyEngine.computeUpdate(metrics);
        const now = Date.now();

        if (now < adaptationCooldownUntil && difficultyResult.state === "FLOW") {
            return;
        }

        if (difficultyResult.state !== "FLOW") {
            adaptationCooldownUntil = now + ADAPTATION_COOLDOWN_MS;
        }

        AppUI.onReadingStateUpdate({
            smoothedScore: difficultyResult.smoothedScore,
            rawScore: difficultyResult.rawScore,
            state: difficultyResult.state,
            evidence: difficultyResult.evidenceLabels || [],
            currentWPM: metrics.speed ? metrics.speed.currentWPM : null,
            fixationMs: metrics.fixations ? metrics.fixations.recentMedianMs : null,
            regressions: metrics.regressions ? metrics.regressions.recentCount : 0,
            revisits: metrics.regressions ? metrics.regressions.totalRevisits : 0
        });
    }

    function wireEvents() {
        if (window.EventAPI) {
            EventAPI.on("onSystemReady", function () {
                AppUI.onCVReady();
            });

            EventAPI.on("onCalibrationComplete", function (data) {
                AppUI.onCalibrated(data);
                setTimeout(function () {
                    if (window.AdaptiveReaderCV) {
                        window.AdaptiveReaderCV.startBaseline();
                    }
                }, 1200);
            });

            EventAPI.on("onBaselineComplete", function (data) {
                if (window.ReadingIntelligence) {
                    window.ReadingIntelligence.start();
                }
                AppUI.onBaselineReady(data);
            });

            EventAPI.on("onGazeUpdate", function (data) {
                AppUI.onGaze(data);
            });

            EventAPI.on("onSignalQualityUpdate", function (data) {
                AppUI.updateSignalQuality(data);
            });

            EventAPI.on("onFaceQualityChange", function (data) {
                AppUI.onFaceChange(data);
            });
        }

        if (window.ReadingIntelligence) {
            window.ReadingIntelligence.on("onMetricsReady", function (metrics) {
                handleMetricsReady(metrics);
            });
        }
    }

    function bootstrap() {
        AppUI.initialize();
        wireEvents();

        window.AdaptiveReaderApp = {
            onDocumentLoaded: onDocumentLoaded,
            onSessionReset: onSessionReset
        };

        if (window.AdaptiveReaderCV) {
            window.AdaptiveReaderCV.initialize(function (status) {
                AppUI.updateCVStatus(status);
            }).then(function () {
                cvInitialized = true;
                AppUI.onCVReady();
            }).catch(function (err) {
                AppUI.onCVError(err);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
        bootstrap();
    }

})();