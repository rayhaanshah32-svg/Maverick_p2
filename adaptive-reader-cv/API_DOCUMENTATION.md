# The Adaptive Reader — CV / Gaze Pipeline API Documentation

This document defines the Public Event & Method API for the CV / Gaze-Tracking subsystem. It is the integration contract for **Person B** (temporal/scoring engine) and **Person C** (adaptive UI).

---

## 1. Quick Integration

```javascript
// Listen to any event
AdaptiveReaderCV.on("onGazeUpdate", function(data) {
    console.log("Current line:", data.lineIndex, "AOI:", data.aoi);
});

AdaptiveReaderCV.on("onSignalQualityUpdate", function(data) {
    console.log("Signal score (0-100):", data.score);
});

AdaptiveReaderCV.on("onBaselineComplete", function(data) {
    console.log("Baseline WPM:", data.baselineWPM);
});
```

---

## 2. Public Event API Reference

### `onGazeUpdate`
* **Fires**: At a fixed **20 Hz (every 50ms)** with smoothed screen gaze coordinates and active AOI segmentation.
* **Payload**:
```javascript
{
  x: 540,                 // Number: Smoothed screen X (pixels)
  y: 312,                 // Number: Smoothed screen Y (pixels)
  rawX: 554,              // Number: Unfiltered WebGazer X (pixels)
  rawY: 302,              // Number: Unfiltered WebGazer Y (pixels)
  lineIndex: 3,           // Number: 0-indexed global line across passage (-1 if outside)
  localLineIndex: 1,      // Number: 0-indexed line within paragraph (-1 if outside)
  paragraphIndex: 0,      // Number: 0-indexed paragraph index (-1 if outside)
  confidence: 0.85,       // Number (0.0 to 1.0): Current sample confidence score
  aoi: {
    type: "line",         // String: "line" | "paragraph" | "outside"
    lineIndex: 3,         // Number
    localLineIndex: 1,    // Number
    paragraphIndex: 0,    // Number
    lineRect: {           // Object | null: Document-relative bounding box
      top: 290, bottom: 334, left: 180, right: 820
    },
    paragraphRect: {      // Object | null: Paragraph bounding box
      top: 280, bottom: 440, left: 180, right: 820
    }
  },
  timestamp: 1724248800123 // Number: Unix epoch milliseconds
}
```

---

### `onSignalQualityUpdate`
* **Fires**: Every **250ms**. Gives a composite health score of the camera and eye signal.
* **Use for Person B**: Factor this into whether to trust hesitation/difficulty scores at any given moment.
* **Payload**:
```javascript
{
  score: 88,              // Number (0 to 100): Overall signal quality score
  level: "good",          // String: "good" (>=72) | "degraded" (45-71) | "bad" (<45)
  breakdown: {
    facePresence: 30,     // Number (0 or 30): 30 if face detected by MediaPipe
    headPoseStability: 32,// Number (0 to 35): 35 if within ±6° yaw/pitch, drops to 0 at 22°
    eyeState: 15,         // Number (0 or 15): 15 if eyes open, 0 if blinking
    gazeStability: 11     // Number (5 to 20): Point variance in recent samples
  },
  timestamp: 1724248800123
}
```

---

### `onBaselineComplete`
* **Fires**: Exactly once when the initial guided baseline reading passage is finished.
* **Use for Person B**: Wire your z-score difficulty calculations against these personal baseline values.
* **Payload**:
```javascript
{
  baselineWPM: 215,           // Number: Estimated reading speed in Words Per Minute (clamped 90-420)
  baselineFixationMs: 240,    // Number: Average fixation duration in milliseconds (clamped 130-550)
  baselineBlinkRate: 14.5,    // Number: Blinks per minute (clamped 4-35)
  wordsRead: 95,              // Number: Total words in baseline passage
  totalFixations: 38,         // Number: Count of distinct fixation clusters
  durationSeconds: 26.5       // Number: Time taken to complete reading passage
}
```

---

### `onCalibrationComplete`
* **Fires**: When calibration (9-point full or 5-point quick) finishes.
* **Payload**:
```javascript
{
  accuracyScore: 84.5,        // Number (0 to 100): Measured screen accuracy score
  mode: "full",               // String: "full" (9-point) | "quick" (5-point)
  timestamp: 1724248800123
}
```

---

### `onFaceQualityChange`
* **Fires**: When face presence state changes or head exceeds rotation limits.
* **Payload**:
```javascript
{
  facePresent: true,          // Boolean: Face detected in frame
  headPose: {
    yaw: 2.4,                 // Number (degrees): Left (-) / Right (+)
    pitch: -1.2,              // Number (degrees): Up (-) / Down (+)
    roll: 0.8                 // Number (degrees): Head tilt
  },
  blinkState: false,          // Boolean: True if currently blinking (EAR < 0.21)
  timestamp: 1724248800123
}
```

---

### `onRecalibrationNeeded`
* **Fires**: When sustained head rotation (>22° for >1.4s), extreme turn (>35°), or validation drift (>130px) is detected.
* **Payload**:
```javascript
{
  reason: "head_pose_out_of_range", // String: "head_pose_out_of_range" | "gaze_drift_detected" | "manual"
  timestamp: 1724248800123
}
```

---

## 3. Public Control Methods (For Person C — Adaptive UI)

### `AdaptiveReaderCV.setTextRegion(containerSelector)`
Binds the DOM mapper to your rendered reading container.
```javascript
AdaptiveReaderCV.setTextRegion("#my-reading-content");
```

### `AdaptiveReaderCV.refreshTextRegion()`
**Call this whenever your adaptive UI changes font size, line-height, letter-spacing, or margin.** It recalculates all line bounding boxes instantly.
```javascript
function applyDyslexiaFontSettings() {
    readingContainer.style.fontSize = "24px";
    readingContainer.style.lineHeight = "2.4";
    // Tell CV pipeline to recalculate line boxes
    AdaptiveReaderCV.refreshTextRegion();
}
```

### `AdaptiveReaderCV.triggerQuickRecalibration()`
Starts a fast 5-point recalibration (~6 seconds).

### `AdaptiveReaderCV.toggleAOIDebugOverlay(optionalBoolean)`
Shows/hides the visual green/blue bounding boxes for line and paragraph AOIs.

---

## 4. Keyboard Shortcuts (For Live Demos & Fast Testing)

| Key | Action |
| :--- | :--- |
| **`R`** | Run **Quick 5-Point Recalibration** (~6s) |
| **`C`** | Run **Full 9-Point Calibration** |
| **`O`** | Toggle **AOI Bounding Box Overlay** (great for demoing line detection to judges) |
| **`D`** | Toggle **Diagnostics / Signal Tuning Panel** |
| **`B`** | Restart **Baseline Reading Flow** |
| **`S`** | **Fast Skip Baseline** (injects standard baseline: 220 WPM, 240ms fixation, 15 blinks/min) |

---

## 5. Stage Risk & Mitigation Checklist

1. **Camera Permission Prompt Blocked**
   * *Mitigation*: Fallback notice displays in-page with "Retry" button. Ensure browser permissions are granted 10 minutes before going on stage.
2. **Stage Lighting Changes Gaze Calibration Accuracy**
   * *Mitigation*: Hit **`R`** on stage to run a 6-second Quick Recalibration without reloading the page.
3. **Adaptive UI Text Reflows and Breaks Line Index**
   * *Mitigation*: Person C's UI calls `AdaptiveReaderCV.refreshTextRegion()` whenever text layout changes.
4. **Conference Wi-Fi Drops / Slow CDN**
   * *Mitigation*: All MediaPipe FaceMesh WASM and WebGazer scripts are downloaded and served locally from `/mediapipe/face_mesh/` and `/webgazer.js`.
5. **Reader Skims or Stalls During Baseline**
   * *Mitigation*: Automatic sanity clamping ensures baseline WPM stays safely between 90 and 420 WPM. Hit **`S`** to skip baseline with reliable default values during rapid demos.
