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
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        try {
            faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
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
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
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

        for (let i = 0; i < upperIndices.length; i = i + 1) {
            const upper = landmarks[upperIndices[i]];
            const lower = landmarks[lowerIndices[i]];
            const distance = Math.sqrt(
                Math.pow(upper.x - lower.x, 2) +
                Math.pow(upper.y - lower.y, 2) +
                Math.pow(upper.z - lower.z, 2)
            );
            verticalSum = verticalSum + distance;
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
                        blinkFrameCount = blinkFrameCount + 1;
                        if (blinkFrameCount >= EAR_BLINK_FRAMES_NEEDED) {
                            isCurrentlyBlinking = true;
                        }
                    } else {
                        blinkFrameCount = 0;
                        isCurrentlyBlinking = false;
                    }

                    blinkState = isCurrentlyBlinking;

                    const viewportWidth = window.innerWidth || 1200;
                    const viewportHeight = window.innerHeight || 800;

                    let pupilOffsetX = 0;
                    let pupilOffsetY = 0;

                    const leftEyeWidth = Math.abs(landmarks[133].x - landmarks[33].x);
                    const leftEyeHeight = Math.abs(landmarks[159].y - landmarks[145].y);

                    if (landmarks.length > 468 && landmarks[468]) {
                        pupilOffsetX = (landmarks[468].x - landmarks[33].x) / (leftEyeWidth || 0.05) - 0.5;
                        pupilOffsetY = (landmarks[468].y - landmarks[159].y) / (leftEyeHeight || 0.03) - 0.5;
                    } else if (landmarks[1]) {
                        pupilOffsetX = (landmarks[1].x - 0.5) * 1.5;
                        pupilOffsetY = (landmarks[1].y - 0.5) * 1.5;
                    }

                    const gazeX = viewportWidth * (0.5 + (pupilOffsetX * 1.9) + (headPose.yaw / 26) * 0.45);
                    const gazeY = viewportHeight * (0.38 + (pupilOffsetY * 2.2) - (headPose.pitch / 22) * 0.40);

                    const safeGazeX = Math.max(60, Math.min(viewportWidth - 60, gazeX));
                    const safeGazeY = Math.max(60, Math.min(viewportHeight - 60, gazeY));

                    if (window.GazePipeline && window.GazePipeline.addRawSample) {
                        window.GazePipeline.addRawSample(safeGazeX, safeGazeY, 0.92, nowInMs);
                    }
                }

                if (blinkState && !lastBlinkStateRecorded) {
                    blinkTimestamps.push(nowInMs);
                }
                lastBlinkStateRecorded = blinkState;

                const oneMinuteAgo = nowInMs - 60000;
                while (blinkTimestamps.length > 0 && blinkTimestamps[0] < oneMinuteAgo) {
                    blinkTimestamps.shift();
                }

                const activeBlinkRate = Math.max(8, Math.min(35, Math.round(blinkTimestamps.length * (60000 / Math.max(10000, nowInMs - engineStartTime)))));

                const qualityData = {
                    facePresent: facePresent,
                    headPose: headPose,
                    blinkState: blinkState,
                    blinkRate: activeBlinkRate
                };

                lastQualityData = qualityData;

                if (window.EventAPI) {
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

    let lastBlinkStateRecorded = false;
    let blinkTimestamps = [];
    let engineStartTime = Date.now();

    function start(videoElement) {
        if (isRunning) {
            return;
        }
        isRunning = true;
        engineStartTime = performance.now();
        blinkTimestamps = [];
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

if (typeof window !== "undefined") {
    window.MediaPipeEngine = MediaPipeEngine;
}
