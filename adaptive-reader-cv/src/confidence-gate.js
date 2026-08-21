const ConfidenceGate = (function () {

    const HEAD_YAW_LIMIT = 20;
    const HEAD_PITCH_LIMIT = 20;

    const CONFIDENCE_LEVELS = {
        GOOD: "good",
        DEGRADED: "degraded",
        BAD: "bad"
    };

    function assessSample(rawGazePoint) {
        const quality = MediaPipeEngine.getLastQualityData();

        if (!quality.facePresent) {
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "face_not_detected"
            };
        }

        const yawExceeded = Math.abs(quality.headPose.yaw) > HEAD_YAW_LIMIT;
        const pitchExceeded = Math.abs(quality.headPose.pitch) > HEAD_PITCH_LIMIT;

        if (yawExceeded || pitchExceeded) {
            EventAPI.emitRecalibrationNeeded("head_pose_out_of_range");
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "head_pose_out_of_range"
            };
        }

        if (quality.blinkState) {
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "blink_detected"
            };
        }

        const yawRatio = Math.abs(quality.headPose.yaw) / HEAD_YAW_LIMIT;
        const pitchRatio = Math.abs(quality.headPose.pitch) / HEAD_PITCH_LIMIT;
        const headPosePenalty = Math.max(yawRatio, pitchRatio);

        const confidence = Math.max(0, 1 - headPosePenalty);

        const confidenceLevel =
            confidence > 0.7
                ? CONFIDENCE_LEVELS.GOOD
                : CONFIDENCE_LEVELS.DEGRADED;

        return {
            allowed: true,
            confidence: parseFloat(confidence.toFixed(3)),
            confidenceLevel: confidenceLevel,
            reason: null
        };
    }

    return {
        assessSample: assessSample,
        CONFIDENCE_LEVELS: CONFIDENCE_LEVELS
    };

})();
