const BACKEND_URL = "http://localhost:8000";
const GEMINI_API_KEY = "AIzaSyDkfbIlIx5Hhu_P8g7qVcRA6h5FBk0r2jc";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const GLOSSARY_TERMS = {
    "synchronization": "Eyes and brain working together smoothly in time",
    "saccades": "Quick, simultaneous eye jumps between words",
    "phonological": "Connecting printed letters to their spoken sounds",
    "heterogeneities": "Natural differences in how brains process text",
    "bottlenecks": "Points of congestion where reading flow slows down",
    "scaffolding": "Helpful visual guides and spacing that support understanding",
    "perceptual": "How the eyes and brain recognize visual shapes and letters",
    "automaticity": "Effortless, fast recognition of words without strain",
    "trajectory": "The smooth path your eyes take across lines of text",
    "mitochondria": "Parts of cells that help produce energy",
    "cognitive": "Mental actions of thinking, understanding, and remembering"
};

const AppUI = (function () {

    let currentDocument = null;
    let isDemoMode = false;
    let isResetting = false;

    let activeLineIndex = -1;
    let pendingLineIndex = -1;
    let lineConfirmationTimer = null;
    let activeParagraphIndex = -1;
    let activeSentenceIndex = -1;

    let isSpeaking = false;
    let currentUtterance = null;
    let activeTooltipElement = null;

    const el = {};

    function initialize() {
        el.landingScreen = document.getElementById("landing-screen");
        el.readingScreen = document.getElementById("reading-screen");
        el.fileInput = document.getElementById("file-input");
        el.chooseFileBtn = document.getElementById("choose-file-btn");
        el.demoBtn = document.getElementById("demo-btn");
        el.errorMessage = document.getElementById("error-message");
        el.landingCard = document.querySelector(".landing-card");

        el.textContainer = document.getElementById("text-container");
        el.readingRuler = document.getElementById("reading-ruler");
        el.documentTitle = document.getElementById("document-title");
        el.demoBadge = document.getElementById("demo-badge");
        el.backBtn = document.getElementById("back-btn");
        el.calibrateBtn = document.getElementById("calibrate-btn");

        el.systemStatus = document.getElementById("system-status");
        el.readingStatus = document.getElementById("reading-status");

        el.wpmDisplay = document.getElementById("wpm-display");
        el.fixationDisplay = document.getElementById("fixation-display");
        el.frictionDisplay = document.getElementById("friction-display");

        el.wordCountDisplay = document.getElementById("word-count-display");
        el.paraCountDisplay = document.getElementById("para-count-display");

        el.metricQualityBadge = document.getElementById("metric-quality-badge");
        el.barSegFace = document.getElementById("bar-seg-face");
        el.barSegGaze = document.getElementById("bar-seg-gaze");
        el.barSegBlink = document.getElementById("bar-seg-blink");

        el.metricGazeCoords = document.getElementById("metric-gaze-coords");
        el.metricLineInfo = document.getElementById("metric-line-info");
        el.metricConfidence = document.getElementById("metric-confidence");
        el.metricHeadPose = document.getElementById("metric-head-pose");
        el.metricBlinkRate = document.getElementById("metric-blink-rate");
        el.metricRegressions = document.getElementById("metric-regressions");
        el.metricRevisits = document.getElementById("metric-revisits");

        el.adaptationPanel = document.getElementById("adaptation-panel");
        el.dismissAdaptation = document.getElementById("dismiss-adaptation");
        el.adaptationReasons = document.getElementById("adaptation-reasons");
        el.adaptationStateLabel = document.getElementById("adaptation-state-label");
        el.adaptationScoreLabel = document.getElementById("adaptation-score-label");
        el.adaptSpacingBtn = document.getElementById("adapt-spacing-btn");
        el.adaptFontBtn = document.getElementById("adapt-font-btn");
        el.adaptLineHeightBtn = document.getElementById("adapt-line-height-btn");
        el.adaptAiBtn = document.getElementById("adapt-ai-btn");

        el.aiPanel = document.getElementById("ai-panel");
        el.aiText = document.getElementById("ai-text");
        el.aiLoading = document.getElementById("ai-loading");
        el.aiSimplifyBtn = document.getElementById("ai-simplify-btn");
        el.aiExplainBtn = document.getElementById("ai-explain-btn");
        el.aiTtsBtn = document.getElementById("ai-tts-btn");

        el.demoControlsBar = document.getElementById("demo-controls-bar");
        el.demoSimulateFrictionBtn = document.getElementById("demo-simulate-friction-btn");
        el.demoShowAiBtn = document.getElementById("demo-show-ai-btn");
        el.demoResetAdaptationBtn = document.getElementById("demo-reset-adaptation-btn");
        el.demoTtsBtn = document.getElementById("demo-tts-btn");

        el.cvLoadingBanner = document.getElementById("cv-loading-banner");
        el.cvLoadingText = document.getElementById("cv-loading-text");

        el.cvDotCamera = document.getElementById("cv-dot-camera");
        el.cvDotFace = document.getElementById("cv-dot-face");
        el.cvDotGaze = document.getElementById("cv-dot-gaze");

        bindEvents();
    }

    function bindEvents() {
        el.chooseFileBtn.addEventListener("click", function () {
            el.fileInput.click();
        });
        el.fileInput.addEventListener("change", function (event) {
            const file = event.target.files && event.target.files[0];
            if (file) {
                handleFileUpload(file);
            }
        });

        el.landingCard.addEventListener("dragover", function (event) {
            event.preventDefault();
            el.landingCard.classList.add("drag-over");
        });
        el.landingCard.addEventListener("dragleave", function (event) {
            event.preventDefault();
            el.landingCard.classList.remove("drag-over");
        });
        el.landingCard.addEventListener("drop", function (event) {
            event.preventDefault();
            el.landingCard.classList.remove("drag-over");
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (file) {
                handleFileUpload(file);
            }
        });

        el.demoBtn.addEventListener("click", loadDemoDocument);
        el.backBtn.addEventListener("click", resetSession);
        el.calibrateBtn.addEventListener("click", function () {
            if (window.AdaptiveReaderCV) {
                window.AdaptiveReaderCV.startCalibration();
            }
        });

        el.dismissAdaptation.addEventListener("click", hideAdaptationPanel);
        el.adaptSpacingBtn.addEventListener("click", function () { applyContinuousFrictionAdaptation(65); });
        el.adaptFontBtn.addEventListener("click", function () { applyContinuousFrictionAdaptation(80); });
        el.adaptLineHeightBtn.addEventListener("click", function () { applyContinuousFrictionAdaptation(75); });
        el.adaptAiBtn.addEventListener("click", function () {
            callGeminiAI("simplify");
            hideAdaptationPanel();
        });

        el.aiSimplifyBtn.addEventListener("click", function () { callGeminiAI("simplify"); });
        el.aiExplainBtn.addEventListener("click", function () { callGeminiAI("explain"); });
        el.aiTtsBtn.addEventListener("click", readAloudCurrentParagraph);

        el.demoSimulateFrictionBtn.addEventListener("click", function () {
            onReadingStateUpdate({
                smoothedScore: 74,
                state: "HIGH_FRICTION",
                evidence: ["repeated_line_revisit", "prolonged_fixation", "reading_speed_slowdown"],
                currentWPM: 118,
                fixationMs: 460,
                regressions: 5,
                revisits: 3
            });
        });

        el.demoShowAiBtn.addEventListener("click", function () {
            callGeminiAI("simplify");
        });

        el.demoResetAdaptationBtn.addEventListener("click", resetAdaptationSettings);
        el.demoTtsBtn.addEventListener("click", readAloudCurrentParagraph);

        document.addEventListener("keydown", function (event) {
            if (el.readingScreen.classList.contains("hidden")) {
                return;
            }
            if (event.key === "Escape") {
                hideAdaptationPanel();
                dismissTooltip();
                stopSpeech();
            }
        });

        document.addEventListener("click", function (event) {
            if (!event.target.closest(".assist-term") && !event.target.closest(".assist-tooltip")) {
                dismissTooltip();
            }
        });
    }

    async function handleFileUpload(file) {
        showError("");
        setChooseFileBtnLoading(true);

        try {
            const formData = new FormData();
            formData.append("file", file);

            let response = null;
            try {
                response = await fetch(BACKEND_URL + "/api/upload", {
                    method: "POST",
                    body: formData
                });
            } catch (networkError) {
                showError("Backend unavailable. Please start backend with: python -m uvicorn main:app --port 8000");
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || "Upload failed.");
                return;
            }

            currentDocument = {
                name: data.filename,
                paragraphs: data.paragraphs,
                plainText: data.plainText,
                wordCount: data.wordCount
            };

            isDemoMode = false;
            showReadingScreen();

        } finally {
            setChooseFileBtnLoading(false);
        }
    }

    function loadDemoDocument() {
        const paragraphs = [
            "Reading begins with effortless sensory synchronization. Visual saccades sweep fluidly from left to right as words and semantics are processed with high automaticity.",
            "In contrast to conventional phonological reading, complex multi-syllable terminology and dense sentence architecture can create processing bottlenecks, requiring adaptive spacing and typography to reduce visual crowding.",
            "Once contextual scaffolding and focus isolation are introduced, cognitive load rapidly diminishes. The reader's eye movement trajectory stabilizes into smooth forward progression, restoring comfortable reading flow.",
            "Eye tracking technology offers a real-time window into cognitive processing. Webcam systems detect saccadic regressions, fixation anomalies, and word dwell times without special laboratory hardware.",
            "The Adaptive Reader responds dynamically to friction signals by expanding typography, highlighting focus lines with a digital ruler, and offering contextual AI simplification when needed.",
            "This combination of computer vision and proactive assistive design enables readers with dyslexia to maintain comprehension and flow across challenging technical documents."
        ];

        currentDocument = {
            name: "Cognitive Load & Reading Flow",
            paragraphs: paragraphs,
            plainText: paragraphs.join("\n\n"),
            wordCount: paragraphs.join(" ").split(" ").length
        };

        isDemoMode = true;
        showReadingScreen();
    }

    function showReadingScreen() {
        el.landingScreen.classList.add("hidden");
        el.readingScreen.classList.remove("hidden");

        renderDocument();
        resetAdaptationSettings();
        hideAdaptationPanel();

        updateStatus("system", "good");
        updateStatus("reading", "idle");

        el.wordCountDisplay.textContent = currentDocument.wordCount;
        el.paraCountDisplay.textContent = currentDocument.paragraphs.length;

        if (isDemoMode) {
            el.demoBadge.classList.remove("hidden");
        } else {
            el.demoBadge.classList.add("hidden");
        }

        if (window.AdaptiveReaderApp) {
            window.AdaptiveReaderApp.onDocumentLoaded(currentDocument, isDemoMode);
        }
    }

    function wrapSentences(paragraphEl, text) {
        const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [text];
        let wrappedHtml = "";

        for (let i = 0; i < sentences.length; i = i + 1) {
            const sentenceText = sentences[i];
            const words = sentenceText.split(" ");
            let sentenceWordsHtml = "";

            for (let w = 0; w < words.length; w = w + 1) {
                const rawWord = words[w];
                if (rawWord.length > 0) {
                    const cleanWord = rawWord.toLowerCase().replace(/[^a-z]/g, "");
                    if (GLOSSARY_TERMS[cleanWord]) {
                        sentenceWordsHtml = sentenceWordsHtml + '<span class="assist-term" data-term="' + cleanWord + '">' + escapeHtml(rawWord) + '<span class="assist-term-badge">·</span></span> ';
                    } else {
                        sentenceWordsHtml = sentenceWordsHtml + '<span class="word">' + escapeHtml(rawWord) + '</span> ';
                    }
                }
            }

            wrappedHtml = wrappedHtml + '<span class="sentence" data-sentence="' + i + '">' + sentenceWordsHtml + '</span>';
        }

        paragraphEl.innerHTML = wrappedHtml;
        attachGlossaryHandlers(paragraphEl);
    }

    function attachGlossaryHandlers(container) {
        const terms = container.querySelectorAll(".assist-term");
        for (let i = 0; i < terms.length; i = i + 1) {
            terms[i].addEventListener("click", function (event) {
                event.stopPropagation();
                const termKey = this.dataset.term;
                const definition = GLOSSARY_TERMS[termKey];
                if (definition) {
                    showGlossaryTooltip(this, termKey, definition);
                }
            });
        }
    }

    function showGlossaryTooltip(targetEl, term, definition) {
        dismissTooltip();

        const tooltip = document.createElement("div");
        tooltip.className = "glass-card assist-tooltip";
        tooltip.style.position = "absolute";
        tooltip.style.zIndex = "9999";
        tooltip.style.padding = "10px 14px";
        tooltip.style.borderRadius = "10px";
        tooltip.style.maxWidth = "260px";
        tooltip.style.fontSize = "12px";
        tooltip.style.lineHeight = "1.5";
        tooltip.style.background = "rgba(255, 255, 255, 0.95)";
        tooltip.style.border = "1px solid rgba(30, 58, 95, 0.2)";
        tooltip.style.boxShadow = "0 8px 24px rgba(30, 58, 95, 0.2)";
        tooltip.innerHTML = '<strong style="color: var(--navy); text-transform: capitalize; display: block; margin-bottom: 2px;">' + escapeHtml(term) + '</strong><span style="color: var(--ink);">' + escapeHtml(definition) + '</span>';

        document.body.appendChild(tooltip);

        const rect = targetEl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + window.scrollY + 6) + "px";
        tooltip.style.left = (rect.left + window.scrollX) + "px";

        activeTooltipElement = tooltip;
    }

    function dismissTooltip() {
        if (activeTooltipElement && activeTooltipElement.parentNode) {
            activeTooltipElement.parentNode.removeChild(activeTooltipElement);
            activeTooltipElement = null;
        }
    }

    function escapeHtml(string) {
        return string
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function renderDocument() {
        el.documentTitle.textContent = currentDocument.name;
        el.textContainer.innerHTML = '<div id="reading-ruler" class="reading-ruler hidden"></div>';
        el.readingRuler = document.getElementById("reading-ruler");

        for (let i = 0; i < currentDocument.paragraphs.length; i = i + 1) {
            const p = document.createElement("p");
            p.className = "paragraph";
            p.id = "paragraph-" + i;
            p.dataset.index = i;
            wrapSentences(p, currentDocument.paragraphs[i]);
            el.textContainer.appendChild(p);
        }

        applyContinuousFrictionAdaptation(0);
    }

    function applyContinuousFrictionAdaptation(frictionScore) {
        const normalized = Math.max(0, Math.min(100, frictionScore));
        const factor = normalized / 100;

        const fontSize = (18 + factor * 4.5).toFixed(1) + "px";
        const lineHeight = (1.9 + factor * 0.6).toFixed(2);
        const letterSpacing = (0.035 + factor * 0.055).toFixed(3) + "em";
        const wordSpacing = (0.15 + factor * 0.12).toFixed(3) + "em";
        const maxWidth = Math.round(680 - factor * 90) + "px";

        const root = document.documentElement;
        root.style.setProperty("--reader-font-size", fontSize);
        root.style.setProperty("--reader-line-height", lineHeight);
        root.style.setProperty("--reader-letter-spacing", letterSpacing);
        root.style.setProperty("--reader-word-spacing", wordSpacing);
        root.style.setProperty("--reader-max-width", maxWidth);

        if (window.AdaptiveReaderCV && window.AdaptiveReaderCV.refreshTextRegion) {
            window.AdaptiveReaderCV.refreshTextRegion();
        }
    }

    function resetAdaptationSettings() {
        applyContinuousFrictionAdaptation(0);
        hideAdaptationPanel();

        if (window.AdaptiveReaderCV && window.AdaptiveReaderCV.refreshTextRegion) {
            window.AdaptiveReaderCV.refreshTextRegion();
        }
    }

    function onGaze(gazeData) {
        updateSignalMetrics(gazeData);

        if (gazeData.lineIndex !== undefined && gazeData.lineIndex >= 0) {
            handleLineDwell(gazeData.lineIndex, gazeData.paragraphIndex, gazeData.x, gazeData.y);
        }
    }

    function handleLineDwell(lineIndex, paragraphIndex, gazeX, gazeY) {
        if (lineIndex !== pendingLineIndex) {
            pendingLineIndex = lineIndex;
            if (lineConfirmationTimer) {
                clearTimeout(lineConfirmationTimer);
            }
            lineConfirmationTimer = setTimeout(function () {
                commitReadingLine(pendingLineIndex, paragraphIndex, gazeX, gazeY);
            }, 300);
        }
    }

    function commitReadingLine(lineIndex, paragraphIndex, gazeX, gazeY) {
        activeLineIndex = lineIndex;
        activeParagraphIndex = paragraphIndex !== undefined ? paragraphIndex : activeParagraphIndex;

        if (window.DOMMapper) {
            const lineInfo = window.DOMMapper.findLineAtPoint(gazeX || window.innerWidth / 2, gazeY || 300);
            if (lineInfo && lineInfo.aoi && lineInfo.aoi.lineRect) {
                positionReadingRuler(lineInfo.aoi.lineRect);
            }
        }

        updateGraduatedFocusWindow(activeParagraphIndex);
    }

    function positionReadingRuler(lineRect) {
        if (!el.readingRuler || !el.textContainer) {
            return;
        }

        const containerRect = el.textContainer.getBoundingClientRect();
        const windowScrollY = window.scrollY || window.pageYOffset || 0;
        const scrollTop = el.textContainer.scrollTop;

        const relativeTop = (lineRect.top - (containerRect.top + windowScrollY)) + scrollTop - 4;
        const rulerHeight = (lineRect.bottom - lineRect.top) + 8;
        const rulerWidth = containerRect.width - 28;

        el.readingRuler.style.top = relativeTop + "px";
        el.readingRuler.style.left = "14px";
        el.readingRuler.style.width = rulerWidth + "px";
        el.readingRuler.style.height = rulerHeight + "px";
        el.readingRuler.classList.remove("hidden");
    }

    function updateGraduatedFocusWindow(targetParagraphIndex) {
        const paragraphs = el.textContainer.querySelectorAll(".paragraph");
        for (let i = 0; i < paragraphs.length; i = i + 1) {
            paragraphs[i].classList.remove("focus-active", "focus-near-prev", "focus-near-next", "focus-dimmed");
            if (i === targetParagraphIndex) {
                paragraphs[i].classList.add("focus-active");
            } else if (i === targetParagraphIndex - 1) {
                paragraphs[i].classList.add("focus-near-prev");
            } else if (i === targetParagraphIndex + 1) {
                paragraphs[i].classList.add("focus-near-next");
            } else {
                paragraphs[i].classList.add("focus-dimmed");
            }
        }
    }

    function onReadingStateUpdate(data) {
        const score = data.smoothedScore !== undefined ? data.smoothedScore : (data.score || 0);
        const state = data.state || "FLOW";

        updateMetrics(data.currentWPM, data.fixationMs, score);
        updateCognitiveCounters(data.regressions, data.revisits);

        applyContinuousFrictionAdaptation(score);

        if (state === "FLOW") {
            updateStatus("reading", "good");
            hideAdaptationPanel();
        } else if (state === "MILD_FRICTION") {
            updateStatus("reading", "warning");
        } else if (state === "HIGH_FRICTION" || state === "ASSIST") {
            updateStatus("reading", "error");
            showAdaptationPanel(state, score, data.evidence);
        }
    }

    function showAdaptationPanel(state, score, reasons) {
        const stateLabels = {
            MILD_FRICTION: "Mild Reading Friction",
            HIGH_FRICTION: "High Reading Friction",
            ASSIST: "Adaptive Assist Recommended"
        };

        const label = stateLabels[state] || "Reading Friction Detected";
        el.adaptationStateLabel.textContent = label;
        el.adaptationScoreLabel.textContent = "Friction score: " + Math.round(score) + " / 100";

        let reasonsHtml = "";
        if (reasons && reasons.length > 0) {
            for (let i = 0; i < reasons.length; i = i + 1) {
                reasonsHtml = reasonsHtml + '<div class="adaptation-reason">• ' + formatReason(reasons[i]) + '</div>';
            }
        }
        el.adaptationReasons.innerHTML = reasonsHtml;
        el.adaptationPanel.classList.remove("hidden");
    }

    function formatReason(reason) {
        const labels = {
            repeated_line_revisit: "Repeated backwards eye movements",
            prolonged_fixation: "Extended fixation dwell on difficult phrase",
            reading_speed_slowdown: "Reading speed noticeably below baseline",
            prolonged_dwell: "Extended dwell time on passage",
            line_transition_instability: "Unstable line transitions",
            regression_rate: "Repeated line revisits detected",
            fixation_anomaly: "High cognitive dwell on specific words"
        };
        return labels[reason] || reason;
    }

    function hideAdaptationPanel() {
        el.adaptationPanel.classList.add("hidden");
    }

    function getCurrentParagraphElement() {
        if (activeParagraphIndex >= 0) {
            const elById = document.getElementById("paragraph-" + activeParagraphIndex);
            if (elById) {
                return elById;
            }
        }
        return el.textContainer.querySelector(".paragraph");
    }

    async function callGeminiAI(action) {
        const paragraphEl = getCurrentParagraphElement();
        const text = paragraphEl ? paragraphEl.textContent : (currentDocument ? currentDocument.plainText.slice(0, 400) : "Reading text");

        const prompt = action === "simplify"
            ? 'Rewrite this in simpler words for a reader with dyslexia. Use short sentences. Output only the rewritten text:\n\n"' + text + '"'
            : 'Explain this passage in plain language a 12-year-old could understand. Be brief in 2 sentences:\n\n"' + text + '"';

        showAiLoading(true);

        try {
            const response = await fetch(GEMINI_API_URL + "?key=" + GEMINI_API_KEY, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                showAiFallback(action, text);
                return;
            }

            const data = await response.json();
            const result = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "Unable to simplify.";

            showAiResult(result);

        } catch (error) {
            showAiFallback(action, text);
        } finally {
            showAiLoading(false);
        }
    }

    function showAiFallback(action, originalText) {
        if (action === "simplify") {
            const simplified = originalText
                .replace(/sensory synchronization/gi, "eye and brain teamwork")
                .replace(/phonological reading/gi, "standard reading")
                .replace(/heterogeneities/gi, "differences")
                .replace(/processing bottlenecks/gi, "reading slowdowns")
                .replace(/polymorphic visual scaffolding/gi, "visual reading aids")
                .replace(/mitigate perceptual crowding/gi, "make words easier to read")
                .replace(/automaticity/gi, "speed and ease");
            showAiResult(simplified);
        } else {
            showAiResult("Key summary: The text explains how adaptive typography, line focus rulers, and cognitive pacing reduce reading strain for readers with dyslexia.");
        }
    }

    function showAiLoading(loading) {
        if (loading) {
            el.aiLoading.classList.remove("hidden");
            el.aiText.textContent = "";
        } else {
            el.aiLoading.classList.add("hidden");
        }
    }

    function showAiResult(text) {
        el.aiLoading.classList.add("hidden");
        el.aiText.textContent = text;
    }

    function readAloudCurrentParagraph() {
        if (!window.speechSynthesis) {
            alert("Text-to-speech is not supported on this browser.");
            return;
        }

        stopSpeech();

        const paragraphEl = getCurrentParagraphElement();
        if (!paragraphEl) {
            return;
        }

        const words = paragraphEl.querySelectorAll(".word, .assist-term");
        const fullText = paragraphEl.textContent;

        const utterance = new SpeechSynthesisUtterance(fullText);
        utterance.rate = 0.92;
        utterance.pitch = 1.0;

        utterance.onboundary = function (event) {
            if (event.name === "word") {
                const charIndex = event.charIndex;
                let currentWordIndex = 0;
                let accumulatedLength = 0;

                for (let i = 0; i < words.length; i = i + 1) {
                    words[i].classList.remove("word-spoken");
                    const wordLen = words[i].textContent.length + 1;
                    if (charIndex >= accumulatedLength && charIndex < accumulatedLength + wordLen) {
                        currentWordIndex = i;
                    }
                    accumulatedLength = accumulatedLength + wordLen;
                }

                if (words[currentWordIndex]) {
                    words[currentWordIndex].classList.add("word-spoken");
                }
            }
        };

        utterance.onend = function () {
            isSpeaking = false;
            for (let i = 0; i < words.length; i = i + 1) {
                words[i].classList.remove("word-spoken");
            }
        };

        utterance.onerror = function () {
            isSpeaking = false;
        };

        currentUtterance = utterance;
        isSpeaking = true;
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeech() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
    }

    function updateSignalMetrics(gazeData) {
        if (gazeData.x !== undefined && gazeData.y !== undefined) {
            el.metricGazeCoords.textContent = Math.round(gazeData.x) + "px, " + Math.round(gazeData.y) + "px";
        }

        if (gazeData.lineIndex !== undefined && gazeData.lineIndex !== null && gazeData.lineIndex >= 0) {
            el.metricLineInfo.textContent = "Line " + (gazeData.lineIndex + 1) + " (P" + ((gazeData.paragraphIndex || 0) + 1) + ")";
        }

        if (gazeData.confidence !== undefined) {
            el.metricConfidence.textContent = Math.round(gazeData.confidence * 100) + "%";
        }
    }

    function updateSignalQuality(qualityData) {
        const score = qualityData.score || 0;
        el.metricQualityBadge.textContent = "Quality: " + Math.round(score) + "%";

        const breakdown = qualityData.breakdown || { face: 33, gaze: 33, blink: 33 };
        el.barSegFace.style.width = breakdown.face + "%";
        el.barSegGaze.style.width = breakdown.gaze + "%";
        el.barSegBlink.style.width = breakdown.blink + "%";
    }

    function onFaceChange(faceData) {
        if (faceData.headPose) {
            const yaw = Math.round(faceData.headPose.yaw || 0);
            const pitch = Math.round(faceData.headPose.pitch || 0);
            el.metricHeadPose.textContent = "Yaw: " + yaw + "° | Pitch: " + pitch + "°";
        }
        if (faceData.facePresent) {
            setCvStatus("ok", "ok", "warn");
        } else {
            setCvStatus("ok", "warn", "off");
        }
    }

    function onBaselineReady(data) {
        if (data.baselineBlinkRate) {
            el.metricBlinkRate.textContent = Math.round(data.baselineBlinkRate) + " / min";
        }
        updateMetrics(data.baselineWPM || 215, data.baselineFixationMs || 240, 20);
    }

    function onCalibrated(data) {
        setCvStatus("ok", "ok", "ok");
    }

    function onCVReady() {
        setCvStatus("ok", "ok", "ok");
        updateStatus("system", "good");
    }

    function onCVError(error) {
        hideCvLoadingBanner();
        updateStatus("system", "warning");
        setCvStatus("warn", "off", "off");
    }

    function updateCVStatus(message) {
        showCvLoadingBanner(message);
    }

    function updateCognitiveCounters(regressions, revisits) {
        if (regressions !== undefined) {
            el.metricRegressions.textContent = regressions;
        }
        if (revisits !== undefined) {
            el.metricRevisits.textContent = revisits;
        }
    }

    function showError(message) {
        if (message) {
            el.errorMessage.textContent = message;
            el.errorMessage.classList.add("visible");
        } else {
            el.errorMessage.classList.remove("visible");
            el.errorMessage.textContent = "";
        }
    }

    function updateStatus(type, status) {
        let dot = null;
        if (type === "system") {
            dot = el.systemStatus;
        } else if (type === "reading") {
            dot = el.readingStatus;
        }
        if (!dot) {
            return;
        }

        dot.classList.remove("active", "warning", "error", "idle");

        if (status === "good") {
            dot.classList.add("active");
        } else if (status === "warning") {
            dot.classList.add("warning");
        } else if (status === "error") {
            dot.classList.add("error");
        } else {
            dot.classList.add("idle");
        }
    }

    function updateMetrics(wpm, fixationMs, frictionScore) {
        if (wpm !== null && wpm !== undefined) {
            el.wpmDisplay.textContent = Math.round(wpm) + " WPM";
        }
        if (fixationMs !== null && fixationMs !== undefined) {
            el.fixationDisplay.textContent = Math.round(fixationMs) + " ms";
        }
        if (frictionScore !== null && frictionScore !== undefined) {
            el.frictionDisplay.textContent = Math.round(frictionScore) + " / 100";
        }
    }

    function setCvStatus(camera, face, gaze) {
        setCvDot(el.cvDotCamera, camera);
        setCvDot(el.cvDotFace, face);
        setCvDot(el.cvDotGaze, gaze);
    }

    function setCvDot(dot, status) {
        if (!dot) {
            return;
        }
        dot.classList.remove("cv-dot-ok", "cv-dot-warn", "cv-dot-off");
        if (status === "ok") {
            dot.classList.add("cv-dot-ok");
        } else if (status === "warn") {
            dot.classList.add("cv-dot-warn");
        } else {
            dot.classList.add("cv-dot-off");
        }
    }

    function showCvLoadingBanner(message) {
        el.cvLoadingBanner.classList.remove("hidden");
        el.cvLoadingText.textContent = message || "Initializing eye tracking…";
    }

    function hideCvLoadingBanner() {
        el.cvLoadingBanner.classList.add("hidden");
    }

    function setChooseFileBtnLoading(loading) {
        el.chooseFileBtn.disabled = loading;
        el.chooseFileBtn.textContent = loading ? "Processing file…" : "Choose a file";
    }

    function resetSession() {
        if (isResetting) {
            return;
        }
        isResetting = true;

        stopSpeech();
        dismissTooltip();
        hideAdaptationPanel();

        el.readingScreen.classList.add("hidden");
        el.landingScreen.classList.remove("hidden");

        el.textContainer.innerHTML = '<div id="reading-ruler" class="reading-ruler hidden"></div>';
        el.documentTitle.textContent = "Document";
        el.fileInput.value = "";
        el.wpmDisplay.textContent = "-- WPM";
        el.fixationDisplay.textContent = "-- ms";
        el.frictionDisplay.textContent = "-- / 100";
        el.wordCountDisplay.textContent = "--";
        el.paraCountDisplay.textContent = "--";
        el.metricGazeCoords.textContent = "—";
        el.metricLineInfo.textContent = "—";
        el.metricConfidence.textContent = "—";
        el.metricHeadPose.textContent = "—";
        el.metricBlinkRate.textContent = "—";
        el.metricRegressions.textContent = "0";
        el.metricRevisits.textContent = "0";
        el.metricQualityBadge.textContent = "Quality: --";
        el.barSegFace.style.width = "0%";
        el.barSegGaze.style.width = "0%";
        el.barSegBlink.style.width = "0%";
        el.aiText.textContent = "Select an AI action below to assist with the active paragraph.";
        el.demoBadge.classList.add("hidden");

        resetAdaptationSettings();

        currentDocument = null;
        isDemoMode = false;
        activeLineIndex = -1;
        pendingLineIndex = -1;

        if (window.AdaptiveReaderApp) {
            window.AdaptiveReaderApp.onSessionReset();
        }

        isResetting = false;
    }

    function getTextContainer() {
        return el.textContainer;
    }

    function getCurrentDocument() {
        return currentDocument;
    }

    function getIsDemoMode() {
        return isDemoMode;
    }

    return {
        initialize: initialize,
        onGaze: onGaze,
        onReadingStateUpdate: onReadingStateUpdate,
        updateSignalQuality: updateSignalQuality,
        onFaceChange: onFaceChange,
        onBaselineReady: onBaselineReady,
        onCalibrated: onCalibrated,
        onCVReady: onCVReady,
        onCVError: onCVError,
        updateCVStatus: updateCVStatus,
        applyContinuousFrictionAdaptation: applyContinuousFrictionAdaptation,
        callGeminiAI: callGeminiAI,
        readAloudCurrentParagraph: readAloudCurrentParagraph,
        resetAdaptationSettings: resetAdaptationSettings,
        resetSession: resetSession,
        getTextContainer: getTextContainer,
        getCurrentDocument: getCurrentDocument,
        getIsDemoMode: getIsDemoMode
    };

})();