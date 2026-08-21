const ConfidenceGate = (function () {

    const HEAD_YAW_LIMIT = 22;
    const HEAD_PITCH_LIMIT = 20;
    const SUSTAINED_HEAD_MOVE_MS = 1400;
    const EXTREME_HEAD_MOVE_LIMIT = 35;

    let headOutOfRangeStartTime = null;
    let recentSamplesBuffer = [];
    let lastQualityEmitTime = 0;

    const CONFIDENCE_LEVELS = {
        GOOD: "good",
        DEGRADED: "degraded",
        BAD: "bad"
    };

    function calculateSignalQualityScore(quality, recentSamples) {
        let facePresenceScore = quality.facePresent ? 30 : 0;

        let headStabilityScore = 0;
        if (quality.facePresent) {
            const maxAngle = Math.max(Math.abs(quality.headPose.yaw), Math.abs(quality.headPose.pitch));
            if (maxAngle <= 6) {
                headStabilityScore = 35;
            } else if (maxAngle <= HEAD_YAW_LIMIT) {
                const fraction = 1 - ((maxAngle - 6) / (HEAD_YAW_LIMIT - 6));
                headStabilityScore = Math.round(fraction * 35);
            } else {
                headStabilityScore = 0;
            }
        }

        let eyeStateScore = 0;
        if (quality.facePresent) {
            eyeStateScore = quality.blinkState ? 0 : 15;
        }

        let gazeStabilityScore = 10;
        if (recentSamples.length >= 3) {
            let totalDist = 0;
            for (let i = 1; i < recentSamples.length; i++) {
                const dist = Math.sqrt(
                    Math.pow(recentSamples[i].x - recentSamples[i - 1].x, 2) +
                    Math.pow(recentSamples[i].y - recentSamples[i - 1].y, 2)
                );
                totalDist += dist;
            }
            const avgDist = totalDist / (recentSamples.length - 1);
            if (avgDist < 25) {
                gazeStabilityScore = 20;
            } else if (avgDist < 75) {
                gazeStabilityScore = 15;
            } else if (avgDist < 150) {
                gazeStabilityScore = 10;
            } else {
                gazeStabilityScore = 5;
            }
        }

        const totalScore = Math.min(100, Math.max(0,
            facePresenceScore + headStabilityScore + eyeStateScore + gazeStabilityScore
        ));

        let level = CONFIDENCE_LEVELS.GOOD;
        if (totalScore < 45) {
            level = CONFIDENCE_LEVELS.BAD;
        } else if (totalScore < 72) {
            level = CONFIDENCE_LEVELS.DEGRADED;
        }

        return {
            score: totalScore,
            level: level,
            breakdown: {
                facePresence: facePresenceScore,
                headPoseStability: headStabilityScore,
                eyeState: eyeStateScore,
                gazeStability: gazeStabilityScore
            }
        };
    }

    function assessSample(rawGazePoint) {
        const quality = MediaPipeEngine.getLastQualityData();
        const now = Date.now();

        if (rawGazePoint && rawGazePoint.x !== undefined && rawGazePoint.y !== undefined) {
            recentSamplesBuffer.push({ x: rawGazePoint.x, y: rawGazePoint.y, time: now });
            if (recentSamplesBuffer.length > 10) {
                recentSamplesBuffer.shift();
            }
        }

        const qualityEvaluation = calculateSignalQualityScore(quality, recentSamplesBuffer);

        if (now - lastQualityEmitTime > 250) {
            lastQualityEmitTime = now;
            EventAPI.emitSignalQualityUpdate(qualityEvaluation);
        }

        if (!quality.facePresent) {
            headOutOfRangeStartTime = null;
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "face_not_detected"
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

        const yawMagnitude = Math.abs(quality.headPose.yaw);
        const pitchMagnitude = Math.abs(quality.headPose.pitch);
        const isHeadOutOfRange = yawMagnitude > HEAD_YAW_LIMIT || pitchMagnitude > HEAD_PITCH_LIMIT;
        const isExtremeHeadMove = yawMagnitude > EXTREME_HEAD_MOVE_LIMIT || pitchMagnitude > EXTREME_HEAD_MOVE_LIMIT;

        if (isExtremeHeadMove) {
            headOutOfRangeStartTime = null;
            if (typeof CalibrationUI !== "undefined" && !CalibrationUI.isCalibratingNow()) {
                EventAPI.emitRecalibrationNeeded("head_pose_out_of_range");
            }
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "head_pose_extreme"
            };
        }

        if (isHeadOutOfRange) {
            if (!headOutOfRangeStartTime) {
                headOutOfRangeStartTime = now;
            } else if (now - headOutOfRangeStartTime > SUSTAINED_HEAD_MOVE_MS) {
                headOutOfRangeStartTime = null;
                if (typeof CalibrationUI !== "undefined" && !CalibrationUI.isCalibratingNow()) {
                    EventAPI.emitRecalibrationNeeded("head_pose_out_of_range");
                }
            }
            return {
                allowed: false,
                confidence: 0,
                confidenceLevel: CONFIDENCE_LEVELS.BAD,
                reason: "head_pose_out_of_range"
            };
        } else {
            headOutOfRangeStartTime = null;
        }

        const yawRatio = yawMagnitude / HEAD_YAW_LIMIT;
        const pitchRatio = pitchMagnitude / HEAD_PITCH_LIMIT;
        const headPosePenalty = Math.max(yawRatio, pitchRatio);

        const confidence = Math.max(0.1, 1 - (headPosePenalty * 0.7));

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
        calculateSignalQualityScore: calculateSignalQualityScore,
        CONFIDENCE_LEVELS: CONFIDENCE_LEVELS
    };

})();
