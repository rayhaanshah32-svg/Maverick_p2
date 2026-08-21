/**
 * useCV.js — React bridge for the CV Pipeline
 *
 * Connects window.AdaptiveReaderCV and window.ReadingIntelligence
 * (loaded as global scripts via index.html) to React state.
 *
 * Responsibilities:
 *  - Wait for window globals to be ready
 *  - List and select cameras
 *  - Initialize AdaptiveReaderCV with a status callback
 *  - Forward all CV events as React state updates
 *  - Gate signal quality changes into the Reader component
 *  - Provide a stable handleSetTextRegion / handleRefreshTextRegion API
 */
import { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/* Camera enumeration helper                                            */
/* ------------------------------------------------------------------ */
export async function listCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
  } catch (e) {
    console.warn("[useCV] Camera enumeration failed:", e);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Ollama local LLM helper                                              */
/* Calls the locally running Ollama at http://localhost:11434          */
/* ------------------------------------------------------------------ */
export async function ollamaAsk(prompt, model = "qwen2.5:7b") {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const json = await res.json();
  return json.response ?? "";
}

/* ------------------------------------------------------------------ */
/* Main hook                                                            */
/* ------------------------------------------------------------------ */
export function useCV() {
  const [cvStatus, setCvStatus] = useState("idle");
  // idle | requesting-camera | initializing | calibrating | baseline | ready | error | unavailable
  const [cvStatusMsg, setCvStatusMsg] = useState("CV not started yet");
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [signalQuality, setSignalQuality] = useState(92);
  const [gazeData, setGazeData] = useState(null);
  const [calibrationAccuracy, setCalibrationAccuracy] = useState(null);
  const [baselineData, setBaselineData] = useState(null);
  const [cvReady, setCvReady] = useState(false);
  const [proactiveAssistActive, setProactiveAssistActive] = useState(false);

  const initCalledRef = useRef(false);

  /* ---------- wait for CV globals to appear on window ---------- */
  function cvGlobalsReady() {
    return (
      typeof window !== "undefined" &&
      typeof window.AdaptiveReaderCV !== "undefined" &&
      typeof window.ReadingIntelligence !== "undefined" &&
      typeof window.EventAPI !== "undefined"
    );
  }

  /* ---------- enumerate cameras on mount ---------- */
  useEffect(() => {
    listCameras().then((cams) => {
      setCameras(cams);
      if (cams.length > 0) setSelectedCamera(cams[0].deviceId);
    });
  }, []);

  /* ---------- Initialize CV pipeline ---------- */
  const startCV = useCallback(async (cameraDeviceId) => {
    if (initCalledRef.current) return;
    if (!cvGlobalsReady()) {
      setCvStatus("unavailable");
      setCvStatusMsg("CV scripts not loaded. Proactive Assist mode is active.");
      return;
    }

    initCalledRef.current = true;
    setCvStatus("initializing");

    // Patch CameraManager to use the selected camera if available
    if (cameraDeviceId && window.CameraManager?.startCamera) {
      const origStart = window.CameraManager.startCamera.bind(window.CameraManager);
      window.CameraManager.startCamera = () =>
        origStart({ deviceId: { exact: cameraDeviceId } });
    }

    try {
      await window.AdaptiveReaderCV.initialize((msg) => {
        setCvStatusMsg(msg);
      });
    } catch (err) {
      console.error("[useCV] CV init failed:", err);
      setCvStatus("error");
      setCvStatusMsg("Camera/CV init failed — Proactive Assist mode active.");
    }
  }, []);

  /* ---------- Wire CV events once globals are ready ---------- */
  useEffect(() => {
    let pollInterval;

    function wireEvents() {
      const EA = window.EventAPI;
      const RI = window.ReadingIntelligence;
      if (!EA || !RI) return;

      EA.on("onSystemReady", () => {
        setCvStatus("calibrating");
        setCvStatusMsg("System ready — starting calibration…");
      });

      EA.on("onCalibrationComplete", (data) => {
        setCalibrationAccuracy(data.accuracyScore);
        setCvStatus("baseline");
        setCvStatusMsg(`Calibrated (${data.accuracyScore}%) — reading baseline…`);
      });

      EA.on("onBaselineComplete", (data) => {
        setBaselineData(data);
        setCvStatus("ready");
        setCvStatusMsg("Gaze tracking active");
        setCvReady(true);
        // Start the reading intelligence engine
        RI.start();
      });

      EA.on("onSignalQualityUpdate", (data) => {
        setSignalQuality(data.score);
      });

      EA.on("onGazeUpdate", (data) => {
        // Update gaze cursor DOM elements (created in index.html)
        const gc = document.getElementById("gaze-cursor");
        if (gc) {
          gc.style.display = "block";
          gc.style.left = data.x + "px";
          gc.style.top = data.y + "px";
        }
        setGazeData(data);
      });

      EA.on("onFaceQualityChange", (data) => {
        if (!data.facePresent) {
          const gc = document.getElementById("gaze-cursor");
          if (gc) gc.style.display = "none";
        }
      });

      EA.on("onRecalibrationNeeded", () => {
        setCvStatus("calibrating");
        setCvStatusMsg("Recalibrating — please look at the screen");
      });

      RI.on("onProactiveAssistStatusChange", (data) => {
        setProactiveAssistActive(data.active);
        if (data.active) {
          setCvStatusMsg("Proactive Assist Mode — AI available on demand");
        } else {
          setCvStatusMsg("Gaze tracking resumed");
        }
      });

      clearInterval(pollInterval);
    }

    // Poll until globals are available (they load asynchronously from <script> tags)
    pollInterval = setInterval(() => {
      if (cvGlobalsReady()) wireEvents();
    }, 200);

    return () => clearInterval(pollInterval);
  }, []);

  /* ---------- setTextRegion / refreshTextRegion wrappers ---------- */
  const setTextRegion = useCallback((selector) => {
    if (window.AdaptiveReaderCV?.setTextRegion) {
      window.AdaptiveReaderCV.setTextRegion(selector);
    }
  }, []);

  const refreshTextRegion = useCallback(() => {
    if (window.AdaptiveReaderCV?.refreshTextRegion) {
      window.AdaptiveReaderCV.refreshTextRegion();
    }
  }, []);

  const triggerQuickRecalibration = useCallback(() => {
    if (window.AdaptiveReaderCV?.triggerQuickRecalibration) {
      window.AdaptiveReaderCV.triggerQuickRecalibration();
    }
  }, []);

  const triggerProactiveAssist = useCallback((lineIndex, action) => {
    if (window.ReadingIntelligence?.triggerProactiveAssist) {
      window.ReadingIntelligence.triggerProactiveAssist(lineIndex, action);
    }
  }, []);

  const skipBaseline = useCallback(() => {
    if (window.AdaptiveReaderCV?.skipBaselineWithDefaults) {
      window.AdaptiveReaderCV.skipBaselineWithDefaults();
    }
  }, []);

  return {
    cvStatus,
    cvStatusMsg,
    cameras,
    selectedCamera,
    setSelectedCamera,
    signalQuality,
    gazeData,
    calibrationAccuracy,
    baselineData,
    cvReady,
    proactiveAssistActive,
    startCV,
    setTextRegion,
    refreshTextRegion,
    triggerQuickRecalibration,
    triggerProactiveAssist,
    skipBaseline,
  };
}
