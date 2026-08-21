const DOMMapper = (function () {

    let textContainerSelector = null;
    let containerElement = null;
    let lineBoundingBoxes = [];
    let paragraphBoundingBoxes = [];
    let isDebugOverlayVisible = false;
    let debugOverlayCanvas = null;
    let resizeObserver = null;
    let mutationObserver = null;

    const VERTICAL_TOLERANCE_PX = 14;
    const HORIZONTAL_EXPANSION_PX = 35;

    function setTextContainer(selector) {
        textContainerSelector = selector;
        containerElement = document.querySelector(selector);
        setupObservers();
        rebuildBoundingBoxCache();
    }

    function setupObservers() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }

        if (containerElement && window.ResizeObserver) {
            resizeObserver = new ResizeObserver(function () {
                rebuildBoundingBoxCache();
            });
            resizeObserver.observe(containerElement);
        }

        if (containerElement && window.MutationObserver) {
            mutationObserver = new MutationObserver(function () {
                rebuildBoundingBoxCache();
            });
            mutationObserver.observe(containerElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
        }
    }

    function extractLinesFromParagraphUsingRange(paragraphElement, paragraphIndex, startGlobalLineIndex) {
        const lines = [];
        const textNodes = [];

        function collectTextNodes(node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                textNodes.push(node);
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    collectTextNodes(node.childNodes[i]);
                }
            }
        }

        collectTextNodes(paragraphElement);

        if (textNodes.length === 0) {
            return { lines: lines, nextGlobalIndex: startGlobalLineIndex };
        }

        const range = document.createRange();
        let currentGlobalIndex = startGlobalLineIndex;
        let localIndex = 0;

        for (let i = 0; i < textNodes.length; i++) {
            const textNode = textNodes[i];
            const textLength = textNode.textContent.length;
            let charIndex = 0;

            while (charIndex < textLength) {
                while (charIndex < textLength && /\s/.test(textNode.textContent[charIndex])) {
                    charIndex++;
                }
                if (charIndex >= textLength) {
                    break;
                }

                let wordEnd = charIndex;
                while (wordEnd < textLength && !/\s/.test(textNode.textContent[wordEnd])) {
                    wordEnd++;
                }

                range.setStart(textNode, charIndex);
                range.setEnd(textNode, wordEnd);

                const rects = range.getClientRects();
                if (rects.length > 0) {
                    const rect = rects[0];
                    const pageTop = rect.top + window.scrollY;
                    const pageBottom = rect.bottom + window.scrollY;

                    let addedToExistingLine = false;
                    for (let l = 0; l < lines.length; l++) {
                        const existing = lines[l];
                        const verticalOverlap = Math.min(pageBottom, existing.bottomRaw) - Math.max(pageTop, existing.topRaw);
                        if (verticalOverlap > (rect.height * 0.4)) {
                            existing.left = Math.min(existing.left, rect.left - HORIZONTAL_EXPANSION_PX);
                            existing.right = Math.max(existing.right, rect.right + HORIZONTAL_EXPANSION_PX);
                            existing.topRaw = Math.min(existing.topRaw, pageTop);
                            existing.bottomRaw = Math.max(existing.bottomRaw, pageBottom);
                            existing.top = existing.topRaw - VERTICAL_TOLERANCE_PX;
                            existing.bottom = existing.bottomRaw + VERTICAL_TOLERANCE_PX;
                            addedToExistingLine = true;
                            break;
                        }
                    }

                    if (!addedToExistingLine) {
                        lines.push({
                            lineIndex: currentGlobalIndex,
                            localLineIndex: localIndex,
                            paragraphIndex: paragraphIndex,
                            left: rect.left - HORIZONTAL_EXPANSION_PX,
                            right: rect.right + HORIZONTAL_EXPANSION_PX,
                            topRaw: pageTop,
                            bottomRaw: pageBottom,
                            top: pageTop - VERTICAL_TOLERANCE_PX,
                            bottom: pageBottom + VERTICAL_TOLERANCE_PX
                        });
                        currentGlobalIndex++;
                        localIndex++;
                    }
                }

                charIndex = wordEnd;
            }
        }

        return { lines: lines, nextGlobalIndex: currentGlobalIndex };
    }

    function rebuildBoundingBoxCache() {
        lineBoundingBoxes = [];
        paragraphBoundingBoxes = [];

        if (!textContainerSelector) {
            return;
        }

        containerElement = document.querySelector(textContainerSelector);
        if (!containerElement) {
            return;
        }

        const paragraphNodes = containerElement.querySelectorAll("p, .paragraph");
        let currentGlobalLineIndex = 0;

        for (let pIndex = 0; pIndex < paragraphNodes.length; pIndex++) {
            const paragraph = paragraphNodes[pIndex];
            const pRect = paragraph.getBoundingClientRect();
            const pageTop = pRect.top + window.scrollY;
            const pageBottom = pRect.bottom + window.scrollY;

            paragraphBoundingBoxes.push({
                paragraphIndex: pIndex,
                element: paragraph,
                left: pRect.left,
                right: pRect.right,
                top: pageTop,
                bottom: pageBottom
            });

            const preDefinedLineNodes = paragraph.querySelectorAll(".text-line");
            if (preDefinedLineNodes.length > 0) {
                for (let lIndex = 0; lIndex < preDefinedLineNodes.length; lIndex++) {
                    const lineElem = preDefinedLineNodes[lIndex];
                    const lRect = lineElem.getBoundingClientRect();
                    const lineTop = lRect.top + window.scrollY;
                    const lineBottom = lRect.bottom + window.scrollY;

                    lineBoundingBoxes.push({
                        lineIndex: currentGlobalLineIndex,
                        localLineIndex: lIndex,
                        paragraphIndex: pIndex,
                        element: lineElem,
                        left: lRect.left - HORIZONTAL_EXPANSION_PX,
                        right: lRect.right + HORIZONTAL_EXPANSION_PX,
                        topRaw: lineTop,
                        bottomRaw: lineBottom,
                        top: lineTop - VERTICAL_TOLERANCE_PX,
                        bottom: lineBottom + VERTICAL_TOLERANCE_PX
                    });
                    currentGlobalLineIndex++;
                }
            } else {
                const result = extractLinesFromParagraphUsingRange(paragraph, pIndex, currentGlobalLineIndex);
                for (let r = 0; r < result.lines.length; r++) {
                    lineBoundingBoxes.push(result.lines[r]);
                }
                currentGlobalLineIndex = result.nextGlobalIndex;
            }
        }

        if (isDebugOverlayVisible) {
            renderDebugOverlay();
        }
    }

    function findLineAtPoint(gazeX, gazeY) {
        const scrollAdjustedY = gazeY + window.scrollY;

        let bestLineMatch = null;
        let bestLineDistance = Infinity;

        for (let i = 0; i < lineBoundingBoxes.length; i++) {
            const box = lineBoundingBoxes[i];
            if (scrollAdjustedY >= box.top && scrollAdjustedY <= box.bottom) {
                if (gazeX >= box.left && gazeX <= box.right) {
                    const centerY = (box.top + box.bottom) / 2;
                    const distance = Math.abs(scrollAdjustedY - centerY);
                    if (distance < bestLineDistance) {
                        bestLineDistance = distance;
                        bestLineMatch = box;
                    }
                }
            }
        }

        if (bestLineMatch) {
            const paraBox = paragraphBoundingBoxes[bestLineMatch.paragraphIndex];
            return {
                lineIndex: bestLineMatch.lineIndex,
                localLineIndex: bestLineMatch.localLineIndex,
                paragraphIndex: bestLineMatch.paragraphIndex,
                aoi: {
                    type: "line",
                    lineIndex: bestLineMatch.lineIndex,
                    localLineIndex: bestLineMatch.localLineIndex,
                    paragraphIndex: bestLineMatch.paragraphIndex,
                    lineRect: {
                        top: bestLineMatch.topRaw,
                        bottom: bestLineMatch.bottomRaw,
                        left: bestLineMatch.left,
                        right: bestLineMatch.right
                    },
                    paragraphRect: paraBox ? {
                        top: paraBox.top,
                        bottom: paraBox.bottom,
                        left: paraBox.left,
                        right: paraBox.right
                    } : null
                }
            };
        }

        for (let p = 0; p < paragraphBoundingBoxes.length; p++) {
            const pBox = paragraphBoundingBoxes[p];
            if (scrollAdjustedY >= pBox.top && scrollAdjustedY <= pBox.bottom &&
                gazeX >= (pBox.left - HORIZONTAL_EXPANSION_PX) && gazeX <= (pBox.right + HORIZONTAL_EXPANSION_PX)) {
                return {
                    lineIndex: -1,
                    localLineIndex: -1,
                    paragraphIndex: pBox.paragraphIndex,
                    aoi: {
                        type: "paragraph",
                        lineIndex: -1,
                        localLineIndex: -1,
                        paragraphIndex: pBox.paragraphIndex,
                        lineRect: null,
                        paragraphRect: {
                            top: pBox.top,
                            bottom: pBox.bottom,
                            left: pBox.left,
                            right: pBox.right
                        }
                    }
                };
            }
        }

        let closestLine = null;
        let closestVerticalDistance = Infinity;

        for (let i = 0; i < lineBoundingBoxes.length; i++) {
            const box = lineBoundingBoxes[i];
            const centerY = (box.top + box.bottom) / 2;
            const dist = Math.abs(scrollAdjustedY - centerY);
            if (dist < closestVerticalDistance) {
                closestVerticalDistance = dist;
                closestLine = box;
            }
        }

        if (closestLine && closestVerticalDistance < 55) {
            const paraBox = paragraphBoundingBoxes[closestLine.paragraphIndex];
            return {
                lineIndex: closestLine.lineIndex,
                localLineIndex: closestLine.localLineIndex,
                paragraphIndex: closestLine.paragraphIndex,
                aoi: {
                    type: "line",
                    lineIndex: closestLine.lineIndex,
                    localLineIndex: closestLine.localLineIndex,
                    paragraphIndex: closestLine.paragraphIndex,
                    lineRect: {
                        top: closestLine.topRaw,
                        bottom: closestLine.bottomRaw,
                        left: closestLine.left,
                        right: closestLine.right
                    },
                    paragraphRect: paraBox ? {
                        top: paraBox.top,
                        bottom: paraBox.bottom,
                        left: paraBox.left,
                        right: paraBox.right
                    } : null
                }
            };
        }

        return {
            lineIndex: -1,
            localLineIndex: -1,
            paragraphIndex: -1,
            aoi: {
                type: "outside",
                lineIndex: -1,
                localLineIndex: -1,
                paragraphIndex: -1,
                lineRect: null,
                paragraphRect: null
            }
        };
    }

    function createDebugOverlay() {
        if (debugOverlayCanvas) {
            return;
        }
        debugOverlayCanvas = document.createElement("canvas");
        debugOverlayCanvas.id = "dom-mapper-debug-canvas";
        debugOverlayCanvas.style.position = "fixed";
        debugOverlayCanvas.style.top = "0";
        debugOverlayCanvas.style.left = "0";
        debugOverlayCanvas.style.width = "100vw";
        debugOverlayCanvas.style.height = "100vh";
        debugOverlayCanvas.style.pointerEvents = "none";
        debugOverlayCanvas.style.zIndex = "8000";
        debugOverlayCanvas.style.display = "none";
        document.body.appendChild(debugOverlayCanvas);
    }

    function renderDebugOverlay(activeLineIndex, activeParaIndex) {
        if (!isDebugOverlayVisible) {
            return;
        }

        createDebugOverlay();
        debugOverlayCanvas.style.display = "block";
        debugOverlayCanvas.width = window.innerWidth;
        debugOverlayCanvas.height = window.innerHeight;

        const ctx = debugOverlayCanvas.getContext("2d");
        ctx.clearRect(0, 0, debugOverlayCanvas.width, debugOverlayCanvas.height);

        for (let p = 0; p < paragraphBoundingBoxes.length; p++) {
            const pBox = paragraphBoundingBoxes[p];
            const viewTop = pBox.top - window.scrollY;
            const height = pBox.bottom - pBox.top;

            ctx.strokeStyle = p.paragraphIndex === activeParaIndex ? "rgba(99, 102, 241, 0.9)" : "rgba(99, 102, 241, 0.3)";
            ctx.lineWidth = p.paragraphIndex === activeParaIndex ? 2 : 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(pBox.left, viewTop, pBox.right - pBox.left, height);
            ctx.setLineDash([]);
        }

        for (let i = 0; i < lineBoundingBoxes.length; i++) {
            const box = lineBoundingBoxes[i];
            const viewTop = box.top - window.scrollY;
            const height = box.bottom - box.top;

            const isFocused = box.lineIndex === activeLineIndex;

            ctx.fillStyle = isFocused ? "rgba(239, 68, 68, 0.18)" : "rgba(16, 185, 129, 0.08)";
            ctx.fillRect(box.left, viewTop, box.right - box.left, height);

            ctx.strokeStyle = isFocused ? "rgba(239, 68, 68, 0.85)" : "rgba(16, 185, 129, 0.35)";
            ctx.lineWidth = isFocused ? 2 : 1;
            ctx.strokeRect(box.left, viewTop, box.right - box.left, height);

            ctx.fillStyle = isFocused ? "#f87171" : "#34d399";
            ctx.font = "10px monospace";
            ctx.fillText("L" + box.lineIndex, box.left + 4, viewTop + 12);
        }
    }

    function toggleDebugOverlay(forceState) {
        if (typeof forceState === "boolean") {
            isDebugOverlayVisible = forceState;
        } else {
            isDebugOverlayVisible = !isDebugOverlayVisible;
        }

        if (!isDebugOverlayVisible && debugOverlayCanvas) {
            debugOverlayCanvas.style.display = "none";
        } else if (isDebugOverlayVisible) {
            renderDebugOverlay();
        }
        return isDebugOverlayVisible;
    }

    function refreshOnResize() {
        window.addEventListener("resize", function () {
            rebuildBoundingBoxCache();
        });

        window.addEventListener("scroll", function () {
            if (isDebugOverlayVisible) {
                renderDebugOverlay();
            }
        }, { passive: true });
    }

    function getLineCount() {
        return lineBoundingBoxes.length;
    }

    function getParagraphCount() {
        return paragraphBoundingBoxes.length;
    }

    return {
        setTextContainer: setTextContainer,
        rebuildBoundingBoxCache: rebuildBoundingBoxCache,
        findLineAtPoint: findLineAtPoint,
        refreshOnResize: refreshOnResize,
        toggleDebugOverlay: toggleDebugOverlay,
        renderDebugOverlay: renderDebugOverlay,
        getLineCount: getLineCount,
        getParagraphCount: getParagraphCount
    };

})();
