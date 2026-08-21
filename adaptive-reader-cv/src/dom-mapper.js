const DOMMapper = (function () {

    let textContainerSelector = null;
    let lineElements = [];
    let paragraphElements = [];
    let lineBoundingBoxes = [];
    let paragraphBoundingBoxes = [];

    const VERTICAL_TOLERANCE_PX = 12;
    const HORIZONTAL_EXPANSION_PX = 40;

    function setTextContainer(containerSelector) {
        textContainerSelector = containerSelector;
        rebuildBoundingBoxCache();
    }

    function rebuildBoundingBoxCache() {
        lineElements = [];
        paragraphElements = [];
        lineBoundingBoxes = [];
        paragraphBoundingBoxes = [];

        if (!textContainerSelector) {
            return;
        }

        const container = document.querySelector(textContainerSelector);
        if (!container) {
            console.warn("DOMMapper: Container not found:", textContainerSelector);
            return;
        }

        const paragraphNodes = container.querySelectorAll("p, .paragraph");
        for (let paragraphIndex = 0; paragraphIndex < paragraphNodes.length; paragraphIndex++) {
            const paragraph = paragraphNodes[paragraphIndex];
            paragraphElements.push(paragraph);

            const rect = paragraph.getBoundingClientRect();
            paragraphBoundingBoxes.push({
                paragraphIndex: paragraphIndex,
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY,
                left: rect.left,
                right: rect.right
            });

            const lineNodes = paragraph.querySelectorAll(".text-line");
            for (let localLineIndex = 0; localLineIndex < lineNodes.length; localLineIndex++) {
                const lineElement = lineNodes[localLineIndex];
                lineElements.push(lineElement);

                const lineRect = lineElement.getBoundingClientRect();
                lineBoundingBoxes.push({
                    lineIndex: lineBoundingBoxes.length,
                    localLineIndex: localLineIndex,
                    paragraphIndex: paragraphIndex,
                    top: lineRect.top + window.scrollY - VERTICAL_TOLERANCE_PX,
                    bottom: lineRect.bottom + window.scrollY + VERTICAL_TOLERANCE_PX,
                    left: lineRect.left - HORIZONTAL_EXPANSION_PX,
                    right: lineRect.right + HORIZONTAL_EXPANSION_PX,
                    element: lineElement
                });
            }
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
            return {
                lineIndex: bestLineMatch.lineIndex,
                localLineIndex: bestLineMatch.localLineIndex,
                paragraphIndex: bestLineMatch.paragraphIndex
            };
        }

        let closestLine = null;
        let closestVerticalDistance = Infinity;

        for (let i = 0; i < lineBoundingBoxes.length; i++) {
            const box = lineBoundingBoxes[i];
            const centerY = (box.top + box.bottom) / 2;
            const verticalDistance = Math.abs(scrollAdjustedY - centerY);

            if (verticalDistance < closestVerticalDistance) {
                closestVerticalDistance = verticalDistance;
                closestLine = box;
            }
        }

        if (closestLine && closestVerticalDistance < 60) {
            return {
                lineIndex: closestLine.lineIndex,
                localLineIndex: closestLine.localLineIndex,
                paragraphIndex: closestLine.paragraphIndex
            };
        }

        return {
            lineIndex: -1,
            localLineIndex: -1,
            paragraphIndex: -1
        };
    }

    function refreshOnResize() {
        window.addEventListener("resize", function () {
            rebuildBoundingBoxCache();
        });

        window.addEventListener("scroll", function () {
        });
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
        getLineCount: getLineCount,
        getParagraphCount: getParagraphCount
    };

})();
