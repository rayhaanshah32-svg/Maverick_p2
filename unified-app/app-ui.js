const BACKEND_URL = "http://localhost:8000";
const GEMINI_API_KEY = "AIzaSyDkfbIlIx5Hhu_P8g7qVcRA6h5FBk0r2jc";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const AppUI = (function () {

    let currentDocument = null;
    let isDemoMode = false;
    let isResetting = false;

    let currentSettings = {
        fontSize: 18,
        lineHeight: 1.8,
        letterSpacing: 0
    };

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

        el.adaptationPanel = document.getElementById("adaptation-panel");
        el.dismissAdaptation = document.getElementById("dismiss-adaptation");
        el.adaptationReasons = document.getElementById("adaptation-reasons");
        el.adaptationStateLabel = document.getElementById("adaptation-state-label");
        el.adaptationScoreLabel = document.getElementById("adaptation-score-label");
        el.adaptSpacingBtn = document.getElementById("adapt-spacing-btn");
        el.adaptFontBtn = document.getElementById("adapt-font-btn");
        el.adaptLineHeightBtn = document.getElementById("adapt-line-height-btn");

        el.aiPanel = document.getElementById("ai-panel");
        el.dismissAi = document.getElementById("dismiss-ai");
        el.aiText = document.getElementById("ai-text");
        el.aiLoading = document.getElementById("ai-loading");
        el.aiSimplifyBtn = document.getElementById("ai-simplify-btn");
        el.aiExplainBtn = document.getElementById("ai-explain-btn");

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
        el.adaptSpacingBtn.addEventListener("click", function () { applyAdaptation("spacing"); });
        el.adaptFontBtn.addEventListener("click", function () { applyAdaptation("fontSize"); });
        el.adaptLineHeightBtn.addEventListener("click", function () { applyAdaptation("lineHeight"); });

        el.dismissAi.addEventListener("click", hideAiPanel);
        el.aiSimplifyBtn.addEventListener("click", function () { callGeminiAI("simplify"); });
        el.aiExplainBtn.addEventListener("click", function () { callGeminiAI("explain"); });

        document.addEventListener("keydown", function (event) {
            if (el.readingScreen.classList.contains("hidden")) {
                return;
            }
            if (event.key === "Escape") {
                hideAdaptationPanel();
                hideAiPanel();
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
                showError("Document service unavailable. Please start the backend with: uvicorn main:app --port 8000");
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
            "Reading is one of the most complex cognitive tasks we perform. It requires the simultaneous coordination of eye movements, working memory, language processing, and attention — all in a fraction of a second.",
            "Eye tracking technology offers a window into the reading process that was previously only available to researchers in lab settings. Webcam-based systems can approximate gaze position with enough accuracy to detect which line a reader is on.",
            "The Adaptive Reader uses this signal to detect when a reader is struggling — revisiting the same line, reading unusually slowly, or losing their place — and adjusts the display automatically: larger fonts, wider spacing, and highlighted focus lines.",
            "The key insight is that gaze tracking does not need to be word-perfect to be useful. Knowing which line a reader is on is enough to provide meaningful, contextual support that can significantly reduce reading friction.",
            "Visual crowding occurs when letters or words are too close together, making individual shapes hard to identify. This is one of the most common causes of reading friction and can be addressed with adaptive letter spacing.",
            "Cognitive load refers to the mental effort being used in working memory. When reading becomes too demanding, comprehension suffers. Adaptive systems can step in before a reader becomes frustrated."
        ];

        currentDocument = {
            name: "Demo Passage",
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
        resetSettings();
        hideAdaptationPanel();
        hideAiPanel();

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

    function renderDocument() {
        el.documentTitle.textContent = currentDocument.name;
        el.textContainer.innerHTML = "";

        for (let i = 0; i < currentDocument.paragraphs.length; i = i + 1) {
            const p = document.createElement("p");
            p.className = "paragraph";
            p.textContent = currentDocument.paragraphs[i];
            p.dataset.index = i;
            el.textContainer.appendChild(p);
        }

        applyTextSettings();
    }

    function applyTextSettings() {
        el.textContainer.style.fontSize = currentSettings.fontSize + "px";
        el.textContainer.style.lineHeight = currentSettings.lineHeight;
        el.textContainer.style.letterSpacing = currentSettings.letterSpacing + "px";
    }

    function resetSettings() {
        currentSettings = {
            fontSize: 18,
            lineHeight: 1.8,
            letterSpacing: 0
        };
    }

    function resetSession() {
        if (isResetting) {
            return;
        }
        isResetting = true;

        hideAdaptationPanel();
        hideAiPanel();

        el.readingScreen.classList.add("hidden");
        el.landingScreen.classList.remove("hidden");

        el.textContainer.innerHTML = "";
        el.documentTitle.textContent = "Document";
        el.fileInput.value = "";
        el.wpmDisplay.textContent = "--";
        el.fixationDisplay.textContent = "--";
        el.frictionDisplay.textContent = "--";
        el.wordCountDisplay.textContent = "--";
        el.paraCountDisplay.textContent = "--";
        el.demoBadge.classList.add("hidden");

        resetSettings();

        currentDocument = null;
        isDemoMode = false;

        if (window.AdaptiveReaderApp) {
            window.AdaptiveReaderApp.onSessionReset();
        }

        isResetting = false;
    }

    function applyAdaptation(type) {
        if (type === "spacing") {
            currentSettings.letterSpacing = Math.min(currentSettings.letterSpacing + 1, 4);
        } else if (type === "fontSize") {
            currentSettings.fontSize = Math.min(currentSettings.fontSize + 2, 28);
        } else if (type === "lineHeight") {
            currentSettings.lineHeight = Math.min(currentSettings.lineHeight + 0.2, 2.6);
        }

        applyTextSettings();

        if (window.AdaptiveReaderCV) {
            window.AdaptiveReaderCV.refreshTextRegion();
        }

        hideAdaptationPanel();
    }

    function showAdaptationPanel(state, score, reasons) {
        const stateLabels = {
            MILD_FRICTION: "Mild Reading Friction",
            HIGH_FRICTION: "High Reading Friction",
            ASSIST: "Reading Assist Available"
        };

        const label = stateLabels[state] || "Reading Friction Detected";
        el.adaptationStateLabel.textContent = label;
        el.adaptationScoreLabel.textContent = "Friction score: " + Math.round(score);

        let reasonsHtml = "";
        if (reasons && reasons.length > 0) {
            for (let i = 0; i < reasons.length; i = i + 1) {
                reasonsHtml = reasonsHtml + '<div class="adaptation-reason">• ' + formatReason(reasons[i]) + '</div>';
            }
        }
        el.adaptationReasons.innerHTML = reasonsHtml;

        el.adaptationPanel.classList.remove("hidden");
        el.adaptationPanel.dataset.state = state;

        updateStatus("reading", state === "ASSIST" ? "error" : "warning");
    }

    function formatReason(reason) {
        const labels = {
            repeated_line_revisit: "Repeated line revisits detected",
            prolonged_fixation: "Longer fixations than usual",
            reading_speed_slowdown: "Reading speed below baseline",
            prolonged_dwell: "Extended pause on passage",
            line_transition_instability: "Unstable line transitions",
            regression_rate: "Repeated line revisits detected",
            fixation_anomaly: "Longer fixations than usual",
            dwell_pause_anomaly: "Extended pause on passage"
        };
        return labels[reason] || reason;
    }

    function hideAdaptationPanel() {
        el.adaptationPanel.classList.add("hidden");
        el.adaptationPanel.dataset.state = "";
    }

    function showAiPanel(text) {
        el.aiText.textContent = text;
        el.aiLoading.classList.add("hidden");
        el.aiPanel.classList.remove("hidden");
    }

    function hideAiPanel() {
        el.aiPanel.classList.add("hidden");
        el.aiText.textContent = "";
    }

    async function callGeminiAI(mode) {
        if (!currentDocument) {
            return;
        }

        el.aiPanel.classList.remove("hidden");
        el.aiLoading.classList.remove("hidden");
        el.aiText.textContent = "";

        const currentParagraphEl = el.textContainer.querySelector(".paragraph.focused") || el.textContainer.querySelector(".paragraph");
        const passageText = currentParagraphEl ? currentParagraphEl.textContent : currentDocument.paragraphs[0];

        let prompt = "";
        if (mode === "simplify") {
            prompt = "Rewrite this passage in simpler language for a reader who is finding it difficult. Keep the same meaning but use shorter sentences and easier words. Passage: " + passageText;
        } else {
            prompt = "In 2-3 sentences, explain what this passage is saying in plain everyday language. Passage: " + passageText;
        }

        try {
            const requestBody = {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            };

            const response = await fetch(GEMINI_API_URL + "?key=" + GEMINI_API_KEY, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                el.aiLoading.classList.add("hidden");
                el.aiText.textContent = "Reading Assist is currently unavailable. Reading continues normally.";
                return;
            }

            const data = await response.json();
            const resultText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

            el.aiLoading.classList.add("hidden");
            el.aiText.textContent = resultText || "Reading Assist is currently unavailable.";

        } catch (aiError) {
            el.aiLoading.classList.add("hidden");
            el.aiText.textContent = "Reading Assist is currently unavailable. Reading continues normally.";
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
            el.wpmDisplay.textContent = Math.round(wpm);
        }
        if (fixationMs !== null && fixationMs !== undefined) {
            el.fixationDisplay.textContent = Math.round(fixationMs) + "ms";
        }
        if (frictionScore !== null && frictionScore !== undefined) {
            el.frictionDisplay.textContent = Math.round(frictionScore);
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
        el.chooseFileBtn.textContent = loading ? "Reading file…" : "Choose a file";
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
        updateMetrics: updateMetrics,
        updateStatus: updateStatus,
        showAdaptationPanel: showAdaptationPanel,
        hideAdaptationPanel: hideAdaptationPanel,
        showAiPanel: showAiPanel,
        hideAiPanel: hideAiPanel,
        setCvStatus: setCvStatus,
        showCvLoadingBanner: showCvLoadingBanner,
        hideCvLoadingBanner: hideCvLoadingBanner,
        resetSession: resetSession,
        getTextContainer: getTextContainer,
        getCurrentDocument: getCurrentDocument,
        getIsDemoMode: getIsDemoMode
    };

})();