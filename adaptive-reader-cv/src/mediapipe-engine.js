const MediaPipeEngine = (function () {

    let faceLandmarker = null;
    let isRunning = false;
    let animationFrameId = null;

    const HEAD_YAW_THRESHOLD = 20;
    const HEAD_PITCH_THRESHOLD = 20;

    const EAR_BLINK_THRESHOLD = 0.21;
    const EAR_BLINK_FRAMES_NEEDED = 2;

    const LEFT_EYE_UPPER_INDICES = [159, 158, 157, 173];
    const LEFT_EYE_LOWER_INDICES = [145, 144, 163, 7];
    const LEFT_EYE_HORIZONTAL_INDICES = [33, 133];

    const RIGHT_EYE_UPPER_INDICES = [386, 385, 384, 398];
    const RIGHT_EYE_LOWER_INDICES = [374, 373, 390, 249];
    const RIGHT_EYE_HORIZONTAL_INDICES = [362, 263];

    let blinkFrameCount = 0;
    let isCurrentlyBlinking = false;

    let lastQualityData = {
        facePresent: false,
        headPose: { yaw: 0, pitch: 0, roll: 0 },
        blinkState: false
    };

    let lastEmittedFacePresent = null;

    async function initialize() {
        const FaceLandmarker = window.FaceLandmarker;
        const FilesetResolver = window.FilesetResolver;

        if (!FaceLandmarker || !FilesetResolver) {
            throw new Error(
                "MediaPipe not loaded. Make sure the ES module script in index.html ran before this script."
            );
        }

        if (window.Module) {
            delete window.Module;
        }

        const filesetResolver = await FilesetResolver.forVisionTasks(
            "./mediapipe/tasks-vision-wasm"
        );

        try {
            faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: "./mediapipe/tasks-vision-wasm/face_landmarker.task",
                    delegate: "GPU"
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
        } catch (gpuError) {
            faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: "./mediapipe/tasks-vision-wasm/face_landmarker.task",
                    delegate: "CPU"
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
        }

        return true;
    }

    function computeEyeAspectRatio(landmarks, upperIndices, lowerIndices, horizontalIndices) {
        let verticalSum = 0;

        for (let i = 0; i < upperIndices.length; i++) {
            const upper = landmarks[upperIndices[i]];
            const lower = landmarks[lowerIndices[i]];
            const distance = Math.sqrt(
                Math.pow(upper.x - lower.x, 2) +
                Math.pow(upper.y - lower.y, 2) +
                Math.pow(upper.z - lower.z, 2)
            );
            verticalSum += distance;
        }

        const averageVertical = verticalSum / upperIndices.length;

        const leftPoint = landmarks[horizontalIndices[0]];
        const rightPoint = landmarks[horizontalIndices[1]];
        const horizontalDistance = Math.sqrt(
            Math.pow(leftPoint.x - rightPoint.x, 2) +
            Math.pow(leftPoint.y - rightPoint.y, 2) +
            Math.pow(leftPoint.z - rightPoint.z, 2)
        );

        if (horizontalDistance < 0.0001) {
            return 0;
        }

        return averageVertical / horizontalDistance;
    }

    function extractHeadPoseFromMatrix(transformationMatrix) {
        if (!transformationMatrix || !transformationMatrix.data) {
            return { yaw: 0, pitch: 0, roll: 0 };
        }

        const matrix = transformationMatrix.data;

        const pitchRadians = Math.asin(-matrix[9]);
        const yawRadians = Math.atan2(matrix[8], matrix[10]);
        const rollRadians = Math.atan2(matrix[1], matrix[5]);

        const toDegrees = 180 / Math.PI;

        return {
            yaw: yawRadians * toDegrees,
            pitch: pitchRadians * toDegrees,
            roll: rollRadians * toDegrees
        };
    }

    let lastInferenceTime = 0;
    const MIN_INFERENCE_INTERVAL_MS = 32;

    function runDetectionLoop(videoElement) {
        if (!isRunning) {
            return;
        }

        const nowInMs = performance.now();

        if (nowInMs - lastInferenceTime >= MIN_INFERENCE_INTERVAL_MS) {
            lastInferenceTime = nowInMs;

            try {
                const results = faceLandmarker.detectForVideo(videoElement, nowInMs);
                const facePresent = results.faceLandmarks && results.faceLandmarks.length > 0;
                let headPose = { yaw: 0, pitch: 0, roll: 0 };
                let blinkState = false;

                if (facePresent) {
                    const landmarks = results.faceLandmarks[0];

                    if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
                        headPose = extractHeadPoseFromMatrix(results.facialTransformationMatrixes[0]);
                    }

                    const leftEAR = computeEyeAspectRatio(
                        landmarks,
                        LEFT_EYE_UPPER_INDICES,
                        LEFT_EYE_LOWER_INDICES,
                        LEFT_EYE_HORIZONTAL_INDICES
                    );

                    const rightEAR = computeEyeAspectRatio(
                        landmarks,
                        RIGHT_EYE_UPPER_INDICES,
                        RIGHT_EYE_LOWER_INDICES,
                        RIGHT_EYE_HORIZONTAL_INDICES
                    );

                    const averageEAR = (leftEAR + rightEAR) / 2;

                    if (averageEAR < EAR_BLINK_THRESHOLD) {
                        blinkFrameCount++;
                        if (blinkFrameCount >= EAR_BLINK_FRAMES_NEEDED) {
                            isCurrentlyBlinking = true;
                        }
                    } else {
                        blinkFrameCount = 0;
                        isCurrentlyBlinking = false;
                    }

                    blinkState = isCurrentlyBlinking;
                }

                const qualityData = {
                    facePresent: facePresent,
                    headPose: headPose,
                    blinkState: blinkState
                };

                lastQualityData = qualityData;

                const faceStatusChanged = lastEmittedFacePresent !== facePresent;
                const headMovedTooFar =
                    Math.abs(headPose.yaw) > HEAD_YAW_THRESHOLD ||
                    Math.abs(headPose.pitch) > HEAD_PITCH_THRESHOLD;

                if (faceStatusChanged) {
                    lastEmittedFacePresent = facePresent;
                    EventAPI.emitFaceQualityChange(qualityData);
                }

                if (headMovedTooFar) {
                    EventAPI.emitFaceQualityChange(qualityData);
                }
            } catch (err) {
                console.warn("[MediaPipeEngine] Inference frame skipped:", err.message);
            }
        }

        animationFrameId = requestAnimationFrame(function () {
            runDetectionLoop(videoElement);
        });
    }

    function start(videoElement) {
        if (isRunning) {
            return;
        }
        isRunning = true;
        runDetectionLoop(videoElement);
    }

    function stop() {
        isRunning = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function getLastQualityData() {
        return lastQualityData;
    }

    function getHeadYawThreshold() {
        return HEAD_YAW_THRESHOLD;
    }

    function getHeadPitchThreshold() {
        return HEAD_PITCH_THRESHOLD;
    }

    return {
        initialize: initialize,
        start: start,
        stop: stop,
        getLastQualityData: getLastQualityData,
        getHeadYawThreshold: getHeadYawThreshold,
        getHeadPitchThreshold: getHeadPitchThreshold
    };

})();
