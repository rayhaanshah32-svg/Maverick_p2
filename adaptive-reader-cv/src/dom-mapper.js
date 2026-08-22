const DOMMapper = (function () {

    let textContainerSelector = null;
    let containerElement = null;
    let lineBoundingBoxes = [];
    let paragraphBoundingBoxes = [];
    let isDebugOverlayVisible = false;
    let debugOverlayCanvas = null;
    let resizeObserver = null;
    let mutationObserver = null;
    let refreshDebounceTimer = null;

    const VERTICAL_TOLERANCE_PX = 14;
    const HORIZONTAL_EXPANSION_PX = 35;

    function debouncedRebuild() {
        if (refreshDebounceTimer) {
            clearTimeout(refreshDebounceTimer);
        }
        refreshDebounceTimer = setTimeout(function () {
            rebuildBoundingBoxCache();
        }, 50);
    }

    function setTextContainer(selector) {
        textContainerSelector = selector;
        containerElement = document.querySelector(selector);
        setupObservers();
        debouncedRebuild();
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
                debouncedRebuild();
            });
            resizeObserver.observe(containerElement);
        }

        if (containerElement && window.MutationObserver) {
            mutationObserver = new MutationObserver(function () {
                debouncedRebuild();
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
                for (let i = 0; i < node.childNodes.length; i = i + 1) {
                    collectTextNodes(node.childNodes[i]);
                }
            }
        }

        collectTextNodes(paragraphElement);

        if (textNodes.length === 0) {
            return lines;
        }

        let currentLineY = null;
        let currentLineBoxes = [];
        let localLineIndex = 0;

        for (let t = 0; t < textNodes.length; t = t + 1) {
            const textNode = textNodes[t];
            const range = document.createRange();

            for (let c = 0; c < textNode.textContent.length; c = c + 1) {
                range.setStart(textNode, c);
                range.setEnd(textNode, c + 1);

                const charRects = range.getClientRects();
                if (charRects.length === 0) {
                    continue;
                }

                const rect = charRects[0];
                if (rect.width === 0 && rect.height === 0) {
                    continue;
                }

                const charCenterY = rect.top + rect.height / 2;

                if (currentLineY === null) {
                    currentLineY = charCenterY;
                    currentLineBoxes.push(rect);
                } else if (Math.abs(charCenterY - currentLineY) > 9) {
                    if (currentLineBoxes.length > 0) {
                        lines.push(
                            buildLineBox(
                                currentLineBoxes,
                                paragraphIndex,
                                localLineIndex,
                                startGlobalLineIndex + localLineIndex
                            )
                        );
                        localLineIndex = localLineIndex + 1;
                    }
                    currentLineBoxes = [rect];
                    currentLineY = charCenterY;
                } else {
                    currentLineBoxes.push(rect);
                }
            }

            range.detach();
        }

        if (currentLineBoxes.length > 0) {
            lines.push(
                buildLineBox(
                    currentLineBoxes,
                    paragraphIndex,
                    localLineIndex,
                    startGlobalLineIndex + localLineIndex
                )
            );
        }

        return lines;
    }

    function buildLineBox(clientRects, paragraphIndex, localLineIndex, globalLineIndex) {
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let minTop = Infinity;
        let maxBottom = -Infinity;

        for (let i = 0; i < clientRects.length; i = i + 1) {
            const r = clientRects[i];
            if (r.left < minLeft) { minLeft = r.left; }
            if (r.right > maxRight) { maxRight = r.right; }
            if (r.top < minTop) { minTop = r.top; }
            if (r.bottom > maxBottom) { maxBottom = r.bottom; }
        }

        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        return {
            paragraphIndex: paragraphIndex,
            localLineIndex: localLineIndex,
            lineIndex: globalLineIndex,
            top: minTop + scrollY - VERTICAL_TOLERANCE_PX,
            bottom: maxBottom + scrollY + VERTICAL_TOLERANCE_PX,
            left: minLeft + scrollX - HORIZONTAL_EXPANSION_PX,
            right: maxRight + scrollX + HORIZONTAL_EXPANSION_PX,
            topRaw: minTop + scrollY,
            bottomRaw: maxBottom + scrollY,
            height: maxBottom - minTop,
            width: maxRight - minLeft
        };
    }

    function rebuildBoundingBoxCache() {
        lineBoundingBoxes = [];
        paragraphBoundingBoxes = [];

        if (!containerElement) {
            return;
        }

        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        const paragraphElements = containerElement.querySelectorAll("p, .paragraph");

        if (paragraphElements.length === 0) {
            const containerRect = containerElement.getBoundingClientRect();
            paragraphBoundingBoxes.push({
                paragraphIndex: 0,
                element: containerElement,
                top: containerRect.top + scrollY,
                bottom: containerRect.bottom + scrollY,
                left: containerRect.left + scrollX,
                right: containerRect.right + scrollX
            });
            return;
        }

        let globalLineIndex = 0;

        for (let p = 0; p < paragraphElements.length; p = p + 1) {
            const pElement = paragraphElements[p];
            const pRect = pElement.getBoundingClientRect();

            paragraphBoundingBoxes.push({
                paragraphIndex: p,
                element: pElement,
                top: pRect.top + scrollY,
                bottom: pRect.bottom + scrollY,
                left: pRect.left + scrollX,
                right: pRect.right + scrollX
            });

            const paragraphLines = extractLinesFromParagraphUsingRange(pElement, p, globalLineIndex);

            if (paragraphLines.length === 0) {
                lineBoundingBoxes.push({
                    paragraphIndex: p,
                    localLineIndex: 0,
                    lineIndex: globalLineIndex,
                    top: pRect.top + scrollY - VERTICAL_TOLERANCE_PX,
                    bottom: pRect.bottom + scrollY + VERTICAL_TOLERANCE_PX,
                    left: pRect.left + scrollX - HORIZONTAL_EXPANSION_PX,
                    right: pRect.right + scrollX + HORIZONTAL_EXPANSION_PX,
                    topRaw: pRect.top + scrollY,
                    bottomRaw: pRect.bottom + scrollY,
                    height: pRect.height,
                    width: pRect.width
                });
                globalLineIndex = globalLineIndex + 1;
            } else {
                for (let l = 0; l < paragraphLines.length; l = l + 1) {
                    lineBoundingBoxes.push(paragraphLines[l]);
                }
                globalLineIndex = globalLineIndex + paragraphLines.length;
            }
        }

        if (isDebugOverlayVisible) {
            renderDebugOverlay();
        }
    }

    function findLineAtPoint(gazeX, gazeY) {
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        const scrollAdjustedX = gazeX + scrollX;
        const scrollAdjustedY = gazeY + scrollY;

        let bestLineMatch = null;
        let smallestVerticalDistance = Infinity;

        for (let i = 0; i < lineBoundingBoxes.length; i = i + 1) {
            const box = lineBoundingBoxes[i];

            const inVerticalBounds = scrollAdjustedY >= box.top && scrollAdjustedY <= box.bottom;
            const inHorizontalBounds = gazeX >= box.left && gazeX <= box.right;

            if (inVerticalBounds && inHorizontalBounds) {
                const lineCenterY = (box.top + box.bottom) / 2;
                const distanceToCenter = Math.abs(scrollAdjustedY - lineCenterY);

                if (distanceToCenter < smallestVerticalDistance) {
                    smallestVerticalDistance = distanceToCenter;
                    bestLineMatch = box;
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

        for (let p = 0; p < paragraphBoundingBoxes.length; p = p + 1) {
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

        for (let i = 0; i < lineBoundingBoxes.length; i = i + 1) {
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

    function findLineAtCoordinates(x, y) {
        return findLineAtPoint(x, y);
    }

    function toggleDebugOverlay(forceState) {
        if (forceState !== undefined) {
            isDebugOverlayVisible = forceState;
        } else {
            isDebugOverlayVisible = !isDebugOverlayVisible;
        }

        if (isDebugOverlayVisible) {
            createDebugCanvas();
            renderDebugOverlay();
        } else {
            removeDebugCanvas();
        }

        return isDebugOverlayVisible;
    }

    function createDebugCanvas() {
        if (debugOverlayCanvas) {
            return;
        }

        debugOverlayCanvas = document.createElement("canvas");
        debugOverlayCanvas.id = "aoi-debug-overlay-canvas";
        debugOverlayCanvas.style.position = "absolute";
        debugOverlayCanvas.style.top = "0";
        debugOverlayCanvas.style.left = "0";
        debugOverlayCanvas.style.width = "100%";
        debugOverlayCanvas.style.height = "100%";
        debugOverlayCanvas.style.pointerEvents = "none";
        debugOverlayCanvas.style.zIndex = "9998";

        document.body.appendChild(debugOverlayCanvas);
    }

    function removeDebugCanvas() {
        if (debugOverlayCanvas && debugOverlayCanvas.parentNode) {
            debugOverlayCanvas.parentNode.removeChild(debugOverlayCanvas);
            debugOverlayCanvas = null;
        }
    }

    function renderDebugOverlay() {
        if (!debugOverlayCanvas) {
            return;
        }

        const scrollWidth = Math.max(document.body.scrollWidth, window.innerWidth);
        const scrollHeight = Math.max(document.body.scrollHeight, window.innerHeight);

        debugOverlayCanvas.width = scrollWidth;
        debugOverlayCanvas.height = scrollHeight;

        const ctx = debugOverlayCanvas.getContext("2d");
        ctx.clearRect(0, 0, scrollWidth, scrollHeight);

        for (let p = 0; p < paragraphBoundingBoxes.length; p = p + 1) {
            const pBox = paragraphBoundingBoxes[p];
            ctx.strokeStyle = "rgba(79, 70, 229, 0.45)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(pBox.left, pBox.top, pBox.right - pBox.left, pBox.bottom - pBox.top);

            ctx.fillStyle = "rgba(79, 70, 229, 0.65)";
            ctx.font = "bold 10px monospace";
            ctx.fillText("P" + pBox.paragraphIndex, pBox.left + 4, pBox.top + 13);
        }

        for (let i = 0; i < lineBoundingBoxes.length; i = i + 1) {
            const line = lineBoundingBoxes[i];
            ctx.strokeStyle = "rgba(16, 185, 129, 0.65)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(line.left, line.top, line.right - line.left, line.bottom - line.top);
            ctx.setLineDash([]);

            ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
            ctx.font = "9px monospace";
            ctx.fillText("L" + line.lineIndex, line.left + 2, line.top + 9);
        }
    }

    function refreshOnResize() {
        window.addEventListener("resize", function () {
            debouncedRebuild();
        });
        window.addEventListener("scroll", function () {
            debouncedRebuild();
        });
    }

    return {
        setTextContainer: setTextContainer,
        rebuildBoundingBoxCache: debouncedRebuild,
        findLineAtPoint: findLineAtPoint,
        findLineAtCoordinates: findLineAtCoordinates,
        toggleDebugOverlay: toggleDebugOverlay,
        refreshOnResize: refreshOnResize
    };

})();

if (typeof window !== "undefined") {
    window.DOMMapper = DOMMapper;
}
