import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Eye, EyeOff, Compass, Timer, Activity, AlertTriangle, CheckCircle2,
  Volume2, Play, Pause, RotateCcw, Waves, FileText, Camera,
  PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Upload, BookOpen, Clock, Trash2, X,
  Sparkles, ShieldCheck, Cpu, Sliders, Zap, Info, HelpCircle, Layers, SlidersHorizontal, RefreshCw,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import JSZip from "jszip";
import Tesseract from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/* ------------------------------------------------------------------ */
/* Brand tokens (shared with the Code O Clock deck)                    */
/* ------------------------------------------------------------------ */
const NAVY = "#1E3A5F";
const NAVY_DARK = "#132234";
const NAVY_PANEL = "#182D46";
const SKY = "#5FA8D3";
const SKY_BG = "#BFE0F2";
const SKY_HEADER = "#9FCEE8";
const AMBER = "#E8A33D";
const BRICK = "#C1544C";
const SAGE = "#4E9A6B";
const CREAM = "#F7F3EC";
const TINT = "#FBEFDD";
const BEIGE = "#F5F0DC";
const BROWN = "#5C3A1E";
const INK = "#26313F";
const MUTED = "#7C8A9C";
const MUTED_DARK = "#93A4B8";

const BENCHMARK_WPM = 215;

/* ------------------------------------------------------------------ */
/* Liquid-glass tokens                                                 */
/* ------------------------------------------------------------------ */
const GLASS_BLUR = "blur(24px) saturate(1.3)";
const glassStyle = (extra = {}) => ({
  background: "rgba(255, 255, 255, 0.15)",
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  border: "1px solid rgba(255, 255, 255, 0.20)",
  boxShadow:
    "0 8px 32px 0 rgba(0, 0, 0, 0.37), " +
    "inset 0 1px 0 0 rgba(255, 255, 255, 0.65), " +
    "inset 0 0 20px 0 rgba(255, 255, 255, 0.10)",
  ...extra,
});
const glassDarkStyle = (extra = {}) => ({
  background: "rgba(19, 34, 52, 0.35)",
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  boxShadow:
    "0 8px 32px 0 rgba(0, 0, 0, 0.37), " +
    "inset 0 1px 0 0 rgba(255, 255, 255, 0.35), " +
    "inset 0 0 16px 0 rgba(255, 255, 255, 0.05)",
  ...extra,
});

/* Fine top-inner white highlight line to mimic curved glass reflecting light */
function TopGlassHighlight({ opacity = 0.85, style = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "1.5px",
        background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${opacity * 0.5}) 12%, rgba(255,255,255,${opacity}) 50%, rgba(255,255,255,${opacity * 0.5}) 88%, rgba(255,255,255,0) 100%)`,
        borderTopLeftRadius: "inherit",
        borderTopRightRadius: "inherit",
        pointerEvents: "none",
        zIndex: 10,
        ...style,
      }}
    />
  );
}


/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */
const HISTORY_KEY = "adaptive-reader:history";
const ACTIVE_KEY = "adaptive-reader:active";

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* noop */ }
}
function loadActive() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveActive(file) {
  try {
    if (file) localStorage.setItem(ACTIVE_KEY, JSON.stringify(file));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Passage → words                                                     */
/* ------------------------------------------------------------------ */
function buildWords(paragraphs) {
  const words = [];
  paragraphs.forEach((para, pIdx) => {
    para.split(/\s+/).forEach((tok) => {
      if (!tok) return;
      words.push({
        id: words.length,
        text: tok,
        clean: tok.toLowerCase().replace(/[^a-z]/g, ""),
        para: pIdx,
      });
    });
  });
  return words;
}

function derivePhases(words) {
  if (words.length === 0) return [];
  const findWord = (clean) => words.find((w) => w.clean === clean)?.id ?? 0;
  return [
    {
      id: "ease-1", mode: "ease", duration: 5500,
      metrics: { fixationMs: 250, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 2, postureShift: 1, wpm: 212 }
    },
    {
      id: "struggle-fixation", mode: "struggle", duration: 6500, targetWord: findWord("fighting"),
      metrics: { fixationMs: 1380, regressions: 4, blinkRate: 14, longClosure: false, headTilt: 3, postureShift: 1, wpm: 118 },
      reasons: ["Fixation held ~1.4s on one word — 5× the reader's baseline", "3 backward regressions inside a 6-second window"]
    },
    {
      id: "ease-2", mode: "ease", duration: 4000,
      metrics: { fixationMs: 260, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 214 }
    },
    {
      id: "struggle-blink", mode: "struggle", duration: 6000, targetWord: findWord("backward"),
      metrics: { fixationMs: 520, regressions: 1, blinkRate: 4, longClosure: true, headTilt: 3, postureShift: 1, wpm: 150 },
      reasons: ["Blink rate dropped to 4/min (baseline 17/min)", "One 480ms extended eye-closure detected"]
    },
    {
      id: "ease-3", mode: "ease", duration: 5000,
      metrics: { fixationMs: 245, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 2, postureShift: 1, wpm: 216 }
    },
    {
      id: "struggle-posture", mode: "struggle", duration: 6000, targetWord: findWord("steadily"),
      metrics: { fixationMs: 610, regressions: 2, blinkRate: 15, longClosure: false, headTilt: 14, postureShift: 6, wpm: 172 },
      reasons: ["Head tilt reached 14° off the reading plane", "Leaned back roughly 6cm from the screen"]
    },
    {
      id: "ease-4", mode: "ease", duration: 4500,
      metrics: { fixationMs: 255, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 213 }
    },
    {
      id: "struggle-pace", mode: "struggle", duration: 6500, targetWord: findWord("letters"),
      metrics: { fixationMs: 310, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 3, postureShift: 1, wpm: 95 },
      reasons: ["Reading pace 55% below the benchmark for this line", "No single fixation spike — a sustained, steady drag"]
    },
    {
      id: "ease-5", mode: "ease", duration: 5000,
      metrics: { fixationMs: 250, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 215 }
    },
  ];
}

const DEFAULT_DEFINITIONS = {
  fighting: "struggling against something, using effort to resist it",
  backward: "toward the back, or in reverse of the usual direction",
  steadily: "in a firm, even, continuous way",
  letters: "the written symbols that stand for sounds in a word",
};

/* ------------------------------------------------------------------ */
/* Severity helpers                                                    */
/* ------------------------------------------------------------------ */
const sevFixation = (ms) => (ms > 900 ? 2 : ms > 480 ? 1 : 0);
const sevRegress = (n) => (n >= 4 ? 2 : n >= 2 ? 1 : 0);
const sevBlink = (rate, longClosure) => (longClosure || rate < 6 ? 2 : rate < 11 ? 1 : 0);
const sevTilt = (t) => (t > 12 ? 2 : t > 7 ? 1 : 0);
const sevPosture = (p) => (p > 5 ? 2 : p > 3 ? 1 : 0);
const sevPace = (dev) => (dev > 40 ? 2 : dev > 20 ? 1 : 0);
const SEV_COLOR = [SAGE, AMBER, BRICK];

function deriveVitals(m) {
  const dev = Math.max(0, ((BENCHMARK_WPM - m.wpm) / BENCHMARK_WPM) * 100);
  const gazeSev = Math.max(sevFixation(m.fixationMs), sevRegress(m.regressions));
  const blinkSev = sevBlink(m.blinkRate, m.longClosure);
  const headSev = Math.max(sevTilt(m.headTilt), sevPosture(m.postureShift));
  const paceSev = sevPace(dev);
  const composite = Math.round(((gazeSev + blinkSev + headSev + paceSev) / 8) * 100);
  const alertCount = [gazeSev, blinkSev, headSev, paceSev].filter((s) => s === 2).length;
  const warnCount = [gazeSev, blinkSev, headSev, paceSev].filter((s) => s === 1).length;
  const confidence =
    alertCount >= 2 ? "High" : alertCount === 1 ? "Medium" : warnCount >= 2 ? "Low" : "Stable";
  return { dev, gazeSev, blinkSev, headSev, paceSev, composite, confidence };
}
const lerp = (a, b, t) => a + (b - a) * t;

/* ================================================================== */
/*  PROACTIVE AI LAYER — sparse semantic annotation before reading    */
/*                                                                    */
/*  One-time pass on document load.                                   */
/*  Never called per gaze event.                                      */
/*  Uses Chrome built-in AI (window.ai) → falls back to heuristics.  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Heuristic annotator — rule-based fallback                          */
/* No network, no LLM. Identifies complex/key phrases statically.    */
/* ------------------------------------------------------------------ */
const HEURISTIC_PATTERNS = [
  { re: /neurodevelopmental/i,        type: "key_term",          reason: "Technical neuroscience term",       explanation: "Relating to how the brain and nervous system develop from birth." },
  { re: /phonological/i,              type: "key_term",          reason: "Specialist reading-science term",   explanation: "To do with the sounds of spoken language and how we process them." },
  { re: /ocular\s+fixation/i,         type: "important_concept", reason: "Core gaze-tracking concept",        explanation: "When your eyes pause and hold still on a specific point — the basic unit of reading." },
  { re: /fixation/i,                  type: "key_term",          reason: "Core gaze-tracking term",           explanation: "A brief pause where the eye locks onto a word. Long fixations often signal difficulty." },
  { re: /regression/i,                type: "key_term",          reason: "Reading-science term",              explanation: "A backward eye movement to re-read text that was just passed." },
  { re: /visual\s+crowding/i,         type: "important_concept", reason: "Perceptual phenomenon",             explanation: "When letters or words are spaced too closely together, making individual shapes hard to identify." },
  { re: /cognitive\s+load/i,          type: "important_concept", reason: "Psychology term",                   explanation: "The mental effort being used. High cognitive load means the brain is working hard to keep up." },
  { re: /dyslexia/i,                  type: "key_term",          reason: "Central subject of this document",  explanation: "A neurodevelopmental variation that affects reading decoding — unrelated to intelligence." },
  { re: /reading\s+friction/i,        type: "important_concept", reason: "System-specific concept",           explanation: "A score (0–100) measuring how much effort a reader is spending to decode text right now." },
  { re: /adaptive/i,                  type: "key_term",          reason: "Core product concept",              explanation: "Automatically adjusting layout and assistance to match the reader's live needs." },
  { re: /hemisphere/i,                type: "key_term",          reason: "Neuroscience anatomy term",         explanation: "One half of the brain. The left hemisphere handles most language and reading tasks." },
  { re: /(complex|complicated)\s+\w+/i, type: "complex_phrase",  reason: "Potentially dense phrasing",       explanation: "This phrase describes something with several interacting parts — slow down here if needed." },
];

const MAX_ANNOTATIONS = 5; // keep the page calm

function heuristicAnnotate(plainText) {
  const found = [];
  const usedPhrases = new Set();
  for (const pat of HEURISTIC_PATTERNS) {
    if (found.length >= MAX_ANNOTATIONS) break;
    const match = pat.re.exec(plainText);
    if (!match) continue;
    const phrase = match[0].trim();
    const norm = phrase.toLowerCase();
    if (usedPhrases.has(norm)) continue;
    usedPhrases.add(norm);
    found.push({ phrase, type: pat.type, reason: pat.reason, explanation: pat.explanation });
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* AI annotator — Chrome built-in AI (window.ai.languageModel)        */
/* Falls through silently to heuristic if unavailable.                */
/* ------------------------------------------------------------------ */
const AI_ANNOTATION_PROMPT = (text) => `
You are a reading-accessibility assistant. Given this passage, identify up to 5 key items that a reader with dyslexia might find difficult or important.

Return ONLY valid JSON in this exact format:
{"annotations":[{"phrase":"exact phrase from text","type":"key_term|important_concept|complex_phrase","reason":"one short sentence","explanation":"plain language explanation in 1–2 sentences"}]}

Rules:
- phrase must appear verbatim in the source text
- maximum 5 items, choose only the most valuable
- prefer technical terms and central concepts
- do NOT annotate common words
- keep explanations under 30 words

Passage:
"""
${text.slice(0, 1200)}
"""
`.trim();

async function aiAnnotate(plainText) {
  const session = await window.ai.languageModel.create({
    systemPrompt: "You are a concise, JSON-only reading accessibility annotator.",
  });
  const raw = await session.prompt(AI_ANNOTATION_PROMPT(plainText));
  session.destroy();
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return (parsed.annotations ?? []).slice(0, MAX_ANNOTATIONS);
}

/* ------------------------------------------------------------------ */
/* useAnnotations hook                                                 */
/* Runs once per document. Returns {annotationMap, status}            */
/* annotationMap: Map<phraseClean, annotationObject>                  */
/* ------------------------------------------------------------------ */
function useAnnotations(plainText) {
  const [annotationMap, setAnnotationMap] = useState(new Map());
  const [status, setStatus] = useState("idle"); // idle | loading | ready | failed | unavailable

  useEffect(() => {
    if (!plainText || plainText.trim().length < 20) return;
    let cancelled = false;
    setStatus("loading");

    async function run() {
      let annotations = [];
      try {
        if (window?.ai?.languageModel?.create) {
          annotations = await aiAnnotate(plainText);
        } else {
          annotations = heuristicAnnotate(plainText);
        }
      } catch {
        try {
          annotations = heuristicAnnotate(plainText);
        } catch {
          if (!cancelled) setStatus("failed");
          return;
        }
      }
      if (cancelled) return;
      if (annotations.length === 0) {
        annotations = heuristicAnnotate(plainText);
      }
      const map = new Map();
      for (const ann of annotations) {
        const key = ann.phrase.toLowerCase().replace(/\s+/g, " ").trim();
        map.set(key, ann);
      }
      setAnnotationMap(map);
      setStatus(annotations.length > 0 ? "ready" : "unavailable");
    }

    run();
    return () => { cancelled = true; };
  }, [plainText]);

  return { annotationMap, status };
}

/* ------------------------------------------------------------------ */
/* resolveWordAnnotation                                               */
/* Check if a word (or its surrounding n-gram up to 3 words) is in    */
/* the annotation map. Returns the annotation or null.                 */
/* ------------------------------------------------------------------ */
function resolveWordAnnotation(word, wordsArray, annotationMap) {
  if (!annotationMap || annotationMap.size === 0) return null;
  const clean1 = word.clean;
  if (annotationMap.has(clean1)) return annotationMap.get(clean1);
  // 2-gram and 3-gram check
  const idx = word.id;
  for (let n = 2; n <= 3; n++) {
    for (let start = idx - n + 1; start <= idx; start++) {
      const slice = wordsArray.slice(Math.max(0, start), start + n);
      if (slice.length < n) continue;
      const phrase = slice.map(w => w.clean).join(" ");
      if (annotationMap.has(phrase)) return annotationMap.get(phrase);
    }
  }
  return null;
}

/* ================================================================== */
/*  TTS ENGINE — browser SpeechSynthesis, gaze-independent           */
/* ================================================================== */

function useTTS() {
  const [ttsState, setTtsState] = useState("idle"); // idle | loading | speaking | paused
  const utteranceRef = useRef(null);

  const stop = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setTtsState("idle");
  }, []);

  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window) || !text?.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.trim());
    u.rate = 0.88;
    u.pitch = 1.0;
    // Prefer a local English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && (v.localService || v.name.includes("Google"))
    );
    if (preferred) u.voice = preferred;
    u.onstart = () => setTtsState("speaking");
    u.onend = () => setTtsState("idle");
    u.onerror = () => setTtsState("idle");
    utteranceRef.current = u;
    setTtsState("loading");
    window.speechSynthesis.speak(u);
  }, []);

  const speakSentence = useCallback((wordId, wordsArray) => {
    if (!wordsArray?.length) return;
    const w = wordsArray[wordId] ?? wordsArray[0];
    const paraParagraphs = wordsArray.filter((x) => x.para === w.para).map((x) => x.text);
    speak(paraParagraphs.join(" "));
  }, [speak]);

  const pause = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    setTtsState("paused");
  }, []);

  const resume = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.resume();
    setTtsState("speaking");
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  return { ttsState, speak, speakSentence, pause, resume, stop };
}

/* ================================================================== */
/*  ContextualAssistPanel — shown on word click / OFFER_* actions    */
/* ================================================================== */
const ANNOTATION_TYPE_LABELS = {
  key_term:            "Key Term",
  important_concept:   "Important Concept",
  complex_phrase:      "Complex Phrase",
  important_sentence:  "Key Sentence",
};

function ContextualAssistPanel({ word, annotation, onDismiss, tts }) {
  if (!word) return null;
  const { ttsState, speak, speakSentence } = tts;
  const isSpeaking = ttsState === "speaking" || ttsState === "paused";
  const displayText = annotation?.explanation
    || DEFAULT_DEFINITIONS[word.clean]
    || "No plain-language note available for this word.";
  const simpleText = annotation?.explanation
    ? `In simple terms: ${annotation.explanation}`
    : `This word (${word.clean}) appears in this passage and may be worth noting.`;

  return (
    <div
      className="animate-slide-down"
      style={{
        marginTop: 28,
        borderRadius: 14,
        background: "rgba(255,255,255,0.82)",
        border: `1px solid rgba(30,58,95,0.18)`,
        backdropFilter: "blur(18px) saturate(1.2)",
        WebkitBackdropFilter: "blur(18px) saturate(1.2)",
        boxShadow: "0 8px 28px rgba(30,58,95,0.14)",
        overflow: "hidden",
      }}
    >
      <TopGlassHighlight opacity={0.6} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 10px",
        borderBottom: "1px solid rgba(30,58,95,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            background: annotation ? "rgba(30,58,95,0.10)" : "rgba(232,163,61,0.15)",
            borderRadius: 6, padding: "3px 8px",
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
            color: annotation ? NAVY : AMBER,
          }}>
            {annotation ? (ANNOTATION_TYPE_LABELS[annotation.type] || "Note") : "Contextual Assist"}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
            "{word.text.replace(/[^a-zA-Z\-']/g, "")}"
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: MUTED, padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
          }}
          title="Dismiss (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* What it means */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: MUTED, marginBottom: 4 }}>
            WHAT IT MEANS
          </div>
          <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.6 }}>
            {displayText}
          </div>
        </div>

        {/* Simpler explanation */}
        {annotation?.reason && (
          <div style={{
            background: "rgba(95,168,211,0.10)", borderRadius: 8,
            padding: "8px 12px", fontSize: 12.5, color: NAVY, lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 700 }}>Why it matters: </span>
            {annotation.reason}
          </div>
        )}

        {/* TTS Controls */}
        <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          {!isSpeaking ? (
            <>
              <button
                onClick={() => speak(word.clean)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                  color: "#fff", background: NAVY, border: "none", borderRadius: 8,
                  padding: "6px 14px", cursor: "pointer",
                }}
              >
                <Volume2 size={13} /> Listen to word
              </button>
              <button
                onClick={() => speakSentence(word.id, null)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                  color: NAVY, background: "rgba(30,58,95,0.08)", border: "1px solid rgba(30,58,95,0.20)",
                  borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                }}
              >
                <Volume2 size={13} /> Read paragraph
              </button>
            </>
          ) : (
            <>
              <button
                onClick={ttsState === "paused" ? tts.resume : tts.pause}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                  color: "#fff", background: ttsState === "paused" ? SAGE : AMBER,
                  border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                }}
              >
                {ttsState === "paused" ? <Play size={13} /> : <Pause size={13} />}
                {ttsState === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                onClick={tts.stop}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                  color: MUTED, background: "transparent", border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                }}
              >
                <X size={12} /> Stop
              </button>
            </>
          )}
          <button
            onClick={onDismiss}
            style={{
              marginLeft: "auto", fontSize: 12, fontWeight: 600,
              color: MUTED, background: "transparent", border: "none",
              cursor: "pointer", padding: "6px 2px",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sky-blue liquid glass overlay — blurred orbs + floating curved glass panels */
/* ------------------------------------------------------------------ */
function SkyBackgroundDesigns() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        background: "transparent",
      }}
    >
      <svg style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
        <defs>
          {/* Glossy glass orbs */}
          <radialGradient id="orb-cyan" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#E6F4FB" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#9FCEE8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-sky" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
            <stop offset="55%" stopColor="#C7E4F2" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#5FA8D3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-deep" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#BFE0F2" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="orb-navy-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#132234" stopOpacity="0.65" />
            <stop offset="60%" stopColor="#1E3A5F" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0" />
          </radialGradient>

          {/* Curved glass light reflection highlight line gradient */}
          <linearGradient id="curved-glass-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="20%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Faint glass-noise grid */}
          <pattern id="sky-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <circle cx="28" cy="28" r="1.2" fill="#1E3A5F" fillOpacity="0.08" />
            <circle cx="0" cy="0" r="1.1" fill="#FFFFFF" fillOpacity="0.45" />
            <circle cx="56" cy="0" r="1.1" fill="#FFFFFF" fillOpacity="0.45" />
            <circle cx="0" cy="56" r="1.1" fill="#FFFFFF" fillOpacity="0.45" />
            <circle cx="56" cy="56" r="1.1" fill="#FFFFFF" fillOpacity="0.45" />
          </pattern>

          {/* Soft top highlight */}
          <linearGradient id="top-shine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ambient glass orbs scattered across the sky */}
        <ellipse cx="14%" cy="22%" rx="240" ry="200" fill="url(#orb-cyan)" className="glass-pulse" />
        <ellipse cx="86%" cy="12%" rx="320" ry="220" fill="url(#orb-navy-glow)" className="glass-pulse" />
        <ellipse cx="78%" cy="78%" rx="360" ry="260" fill="url(#orb-cyan)" className="glass-pulse" />
        <ellipse cx="22%" cy="86%" rx="380" ry="320" fill="url(#orb-navy-glow)" className="glass-pulse" />
        <ellipse cx="50%" cy="20%" rx="520" ry="350" fill="url(#orb-navy-glow)" opacity="0.75" />
        <ellipse cx="50%" cy="50%" rx="420" ry="300" fill="url(#orb-sky)" opacity="0.4" />

        {/* Curved glass reflection stroke paths reflecting light across the sky blue canvas */}
        <path d="M -50 120 Q 350 -40 850 160" fill="none" stroke="url(#curved-glass-highlight)" strokeWidth="2.5" opacity="0.45" />
        <path d="M 400 950 Q 900 650 1450 850" fill="none" stroke="url(#curved-glass-highlight)" strokeWidth="2.5" opacity="0.35" />
        <path d="M 100 400 Q 600 200 1200 450" fill="none" stroke="url(#curved-glass-highlight)" strokeWidth="1.5" opacity="0.25" />

        {/* Faint dot grid overlay */}
        <rect width="100%" height="100%" fill="url(#sky-grid)" />

        {/* Light reflection from top edge */}
        <rect width="100%" height="100%" fill="url(#top-shine)" />
      </svg>

      {/* Decorative curved glass panels floating in the sky blue margins */}
      {/* Top Left Glass Card */}
      <div
        className="glass-float-slow"
        style={{
          position: "absolute",
          top: "36px",
          left: "320px",
          width: "220px",
          ...glassStyle({
            background: "rgba(255, 255, 255, 0.15)",
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: "1px solid rgba(255, 255, 255, 0.20)",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 8px 32px 0 rgba(0,0,0,0.37), inset 0 1px 0 0 rgba(255,255,255,0.65)",
            pointerEvents: "auto",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.85} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: NAVY }}>
          <Eye size={15} color={SKY} />
          <span>Eye-Tracking Gaze AI</span>
        </div>
        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: BROWN, fontWeight: 500 }}>Pupil Fixation</span>
          <span style={{ fontSize: "11px", color: SAGE, fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: SAGE, display: "inline-block" }} />
            60 FPS Sync
          </span>
        </div>
        <div style={{ marginTop: "6px", width: "100%", height: "4px", background: "rgba(30,58,95,0.1)", borderRadius: "99px", overflow: "hidden" }}>
          <div style={{ width: "82%", height: "100%", background: `linear-gradient(90deg, ${SKY}, ${NAVY})`, borderRadius: "99px" }} />
        </div>
      </div>

      {/* Top Right Glass Card */}
      <div
        className="glass-float-reverse"
        style={{
          position: "absolute",
          top: "36px",
          right: "320px",
          width: "210px",
          ...glassDarkStyle({
            background: "rgba(19, 34, 52, 0.35)",
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 8px 32px 0 rgba(0,0,0,0.37), inset 0 1px 0 0 rgba(255,255,255,0.35)",
            pointerEvents: "auto",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.5} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: "#F2F8FC" }}>
          <Waves size={15} color={AMBER} />
          <span>Acoustic Cadence</span>
        </div>
        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "3px", height: "18px" }}>
          {[40, 75, 50, 90, 60, 100, 45, 80, 65, 30].map((h, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: `${h}%`,
                background: idx % 2 === 0 ? AMBER : SKY,
                borderRadius: "2px",
                opacity: 0.85,
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: "6px", fontSize: "10.5px", color: MUTED_DARK, textAlign: "right" }}>
          215 WPM Target Pace
        </div>
      </div>

      {/* Bottom Left Glass Card */}
      <div
        className="glass-float-reverse"
        style={{
          position: "absolute",
          bottom: "36px",
          left: "320px",
          width: "230px",
          ...glassStyle({
            background: "rgba(255, 255, 255, 0.15)",
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: "1px solid rgba(255, 255, 255, 0.20)",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 8px 32px 0 rgba(0,0,0,0.37), inset 0 1px 0 0 rgba(255,255,255,0.65)",
            pointerEvents: "auto",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.85} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: NAVY }}>
          <Sparkles size={15} color={AMBER} />
          <span>Cognitive Flow Index</span>
        </div>
        <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11px" }}>
          <div style={{ background: "rgba(255,255,255,0.3)", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.4)" }}>
            <span style={{ color: MUTED, display: "block", fontSize: "9.5px" }}>Fixation</span>
            <strong style={{ color: NAVY }}>250 ms</strong>
          </div>
          <div style={{ background: "rgba(255,255,255,0.3)", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.4)" }}>
            <span style={{ color: MUTED, display: "block", fontSize: "9.5px" }}>Blink Rate</span>
            <strong style={{ color: NAVY }}>16 / min</strong>
          </div>
        </div>
      </div>

      {/* Bottom Right Glass Card */}
      <div
        className="glass-float-slow"
        style={{
          position: "absolute",
          bottom: "36px",
          right: "320px",
          width: "220px",
          ...glassDarkStyle({
            background: "rgba(19, 34, 52, 0.35)",
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 8px 32px 0 rgba(0,0,0,0.37), inset 0 1px 0 0 rgba(255,255,255,0.35)",
            pointerEvents: "auto",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.5} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: "#F2F8FC" }}>
          <ShieldCheck size={15} color={SAGE} />
          <span>Dyslexia Shield Active</span>
        </div>
        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {["Dynamic Spacing", "Auto Font Weight", "Lexical Assist"].map((tag, idx) => (
            <span
              key={idx}
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#E6F4FB",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)",
                padding: "3px 8px",
                borderRadius: "99px",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Flow wave                                                           */
/* ------------------------------------------------------------------ */
function FlowWave({ stateRef }) {
  const canvasRef = useRef(null);
  const tRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 300, H = 68;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    let raf;
    const draw = () => {
      tRef.current += 0.045;
      const { turbulence, tone } = stateRef.current;
      ctx.clearRect(0, 0, W, H);
      const color = tone === "alert" ? BRICK : tone === "warn" ? AMBER : SKY;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const amp = 8 + turbulence * 16;
      const freq = 0.11 + turbulence * 0.09;
      for (let x = 0; x <= W; x += 2) {
        const noise = turbulence > 0.05 ? (Math.sin(x * 0.9 + tRef.current * 9) * turbulence * 6) : 0;
        const y = H / 2 + Math.sin(x * freq + tRef.current) * amp + noise;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stateRef]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 68, display: "block" }} />;
}

/* ------------------------------------------------------------------ */
/* File readers — extract plain text from PDF / PPTX / images          */
/* ------------------------------------------------------------------ */
async function readPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(strings);
  }
  return pages.join("\n\n");
}

async function readPptxText(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
      return na - nb;
    });
  const slides = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("string");
    const text = xml
      .replace(/<a:br\s*\/?>/g, "\n")
      .replace(/<\/a:p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .trim();
    if (text) slides.push(text);
  }
  return slides.join("\n\n");
}

async function readImageText(file) {
  const url = URL.createObjectURL(file);
  try {
    const { data } = await Tesseract.recognize(url, "eng");
    return (data?.text || "").trim();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".rtf")) {
    return await file.text();
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const buf = await file.arrayBuffer();
    return await readPdfText(buf);
  }
  if (name.endsWith(".pptx") || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const buf = await file.arrayBuffer();
    return await readPptxText(buf);
  }
  if (name.endsWith(".ppt")) {
    throw new Error("Legacy .ppt files aren't supported. Please re-save as .pptx.");
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name)) {
    return await readImageText(file);
  }
  throw new Error("Unsupported file type. Use .txt, .md, .pdf, .pptx, or an image.");
}

const ACCEPT_LIST = ".txt,.md,.markdown,.rtf,.pdf,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*";

/* ------------------------------------------------------------------ */
/* Mild transparent floating background graphics for blank sky space  */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Landing screen                                                      */
/* ------------------------------------------------------------------ */
function Landing({ onOpen, onPickFromHistory }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const readFile = async (file) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const content = await extractText(file);
      if (!content || !content.trim()) {
        throw new Error("No readable text found in that file.");
      }
      onOpen({ name: file.name, size: file.size, content });
    } catch (e) {
      setErr(e?.message || "Could not read this file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        padding: 40,
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      <SkyBackgroundDesigns />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          ...glassStyle({
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: 560,
            border: `1px dashed ${dragOver ? NAVY : "rgba(255,255,255,0.40)"}`,
            borderRadius: 18,
            padding: "40px 36px",
            textAlign: "center",
            overflow: "hidden",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.9} />
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(30,58,95,0.85)",
          border: "1px solid rgba(255,255,255,0.30)",
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 18px",
        }}>
          <BookOpen size={26} color="#fff" />
        </div>
        <div style={{
          fontFamily: "Cambria, serif", fontWeight: 700, fontSize: 26, color: NAVY,
        }}>
          Open a passage to begin
        </div>
        <div style={{
          marginTop: 8, fontSize: 14, color: BROWN, lineHeight: 1.55,
        }}>
          Adaptive Reader watches your reading flow and steps in when a passage turns rough.
          <br />
          Choose a <strong>.txt</strong>, <strong>.md</strong>, <strong>.pdf</strong>, <strong>.pptx</strong>, or image file to get started.
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_LIST}
          style={{ display: "none" }}
          onChange={(e) => readFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            marginTop: 24,
            display: "inline-flex", alignItems: "center", gap: 8,
            background: busy ? MUTED : NAVY, color: "#fff", border: "none", borderRadius: 10,
            padding: "12px 22px", fontSize: 14, fontWeight: 700,
            fontFamily: "Calibri, sans-serif", cursor: busy ? "wait" : "pointer",
            boxShadow: "0 6px 18px rgba(30,58,95,0.25)",
          }}
        >
          <Upload size={16} /> {busy ? "Reading file…" : "Choose a file"}
        </button>
        <div style={{ marginTop: 14, fontSize: 12, color: MUTED }}>
          …or drag and drop one onto this card.
        </div>
        {err && (
          <div style={{
            marginTop: 14, fontSize: 12.5, color: BRICK, fontWeight: 600,
            background: "rgba(193,84,76,0.10)", border: `1px solid ${BRICK}`,
            borderRadius: 8, padding: "8px 10px",
          }}>
            {err}
          </div>
        )}
        {onPickFromHistory && !err && (
          <div style={{ marginTop: 18, fontSize: 12, color: MUTED }}>
            Or pick one from your history on the left.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History sidebar (always visible, collapsible)                        */
/* ------------------------------------------------------------------ */
function HistorySidebar({ open, items, activeId, onOpen, onRemove, onClear, onToggle }) {
  const W = 280;
  return (
    <aside
      style={{
        ...glassDarkStyle({
          width: open ? W : 44,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.10)",
          borderTop: "none",
          borderBottom: "none",
          borderLeft: "none",
          borderRadius: 0,
          display: "flex",
          flexDirection: "column",
          transition: "width 250ms ease",
        }),
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: open ? "space-between" : "center",
        padding: open ? "16px 16px 10px" : "16px 0 10px",
        borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}>
        {open && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={14} color={AMBER} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: AMBER }}>
              RECENT FILES
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          title={open ? "Minimise history" : "Expand history"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.08)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
            margin: open ? 0 : "0 auto",
          }}
        >
          {open ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>
      </div>

      {open && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
            {items.length === 0 && (
              <div style={{
                padding: "20px 12px", fontSize: 12, color: MUTED_DARK,
                textAlign: "center", lineHeight: 1.5,
              }}>
                No files yet.
                <br />
                Open one to see it here.
              </div>
            )}
            {items.map((it) => {
              const isActive = it.id === activeId;
              return (
                <div
                  key={it.id}
                  onClick={() => onOpen(it)}
                  title={it.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 10px", borderRadius: 8, cursor: "pointer",
                    background: isActive ? "rgba(232,163,61,0.18)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isActive ? "rgba(232,163,61,0.55)" : "rgba(255,255,255,0.06)"}`,
                    marginBottom: 4,
                    transition: "background 180ms ease, border-color 180ms ease",
                  }}
                >
                  <FileText size={14} color={isActive ? AMBER : MUTED_DARK} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12.5, color: "#DCE6F0", fontWeight: 600,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {it.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: MUTED_DARK }}>
                      {formatRelative(it.openedAt)}
                      {it.size != null ? ` · ${formatSize(it.size)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(it.id); }}
                    title="Remove from history"
                    style={{
                      background: "transparent", border: "none", padding: 4,
                      color: MUTED_DARK, cursor: "pointer", borderRadius: 6,
                      display: "flex", alignItems: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = BRICK)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = MUTED_DARK)}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={onClear}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6,
                  fontSize: 11.5, fontWeight: 600, color: MUTED_DARK,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 7, padding: "7px 0", cursor: "pointer",
                }}
              >
                <Trash2 size={12} /> Clear history
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatRelative(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/* Person C Helper Modals & Notification Cards                        */
/* ------------------------------------------------------------------ */
function NotificationBanner({ notification, onUndo, onReset }) {
  if (!notification) return null;
  const { action, evidence } = notification;

  const actionTitles = {
    LIGHT_SPACING: "Mild Spacing Assist Active",
    FOCUS_LINE: "Focus Assist Active",
    REDUCE_VISUAL_CROWDING: "Crowding Reduction Active",
    OFFER_DEFINITION: "Contextual Definition Offered",
    OFFER_SIMPLIFICATION: "Plain Sentence Assist Offered",
    OFFER_TTS: "Read-Aloud Assist Offered",
  };

  const evidenceText = Array.isArray(evidence)
    ? evidence.map((e) => e.replace(/_/g, " ")).join(" & ")
    : "reading friction detected";

  return (
    <div
      className="animate-slide-down"
      style={{
        position: "absolute",
        top: 60,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        maxWidth: 580,
        width: "90%",
        ...glassDarkStyle({
          background: "rgba(19, 34, 52, 0.88)",
          border: "1px solid rgba(232, 163, 61, 0.45)",
          borderRadius: 14,
          padding: "12px 18px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }),
      }}
    >
      <TopGlassHighlight opacity={0.9} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(232,163,61,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Sparkles size={16} color={AMBER} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
            {actionTitles[action] || "Reading Assist Active"}
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(220,230,240,0.85)" }}>
            We noticed {evidenceText} — adapting layout gently.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onUndo}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            borderRadius: 7,
            padding: "5px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Undo
        </button>
        <button
          onClick={onReset}
          style={{
            background: "transparent",
            border: "none",
            color: MUTED_DARK,
            borderRadius: 7,
            padding: "5px 8px",
            fontSize: 11.5,
            cursor: "pointer",
          }}
          title="Reset to Standard Theme"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function SessionInsightsModal({ open, onClose, flowScore, interventionsCount, onResetSession }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10, 20, 32, 0.70)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="animate-slide-down"
        style={{
          ...glassDarkStyle({
            width: "100%",
            maxWidth: 500,
            borderRadius: 20,
            padding: "32px 28px",
            background: "rgba(19, 34, 52, 0.94)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.50)",
          }),
        }}
      >
        <TopGlassHighlight opacity={0.9} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={20} color={AMBER} />
            <h3 style={{ margin: 0, fontSize: 18, color: "#FFF", fontFamily: "Cambria, serif" }}>
              Reading Session Insights
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: MUTED_DARK, cursor: "pointer", padding: 4 }}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* 4 Required Metric Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 11, color: MUTED_DARK, fontWeight: 600 }}>Reading Flow</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: SAGE, fontFamily: "Consolas, monospace", marginTop: 2 }}>
              {flowScore}%
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Overall fluency index</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 11, color: MUTED_DARK, fontWeight: 600 }}>Support Used</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: SKY, fontFamily: "Consolas, monospace", marginTop: 2 }}>
              {interventionsCount}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Subtle adaptations</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 11, color: MUTED_DARK, fontWeight: 600 }}>Most Difficult Section</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: AMBER, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Paragraph 1
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Technical vocabulary density</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 11, color: MUTED_DARK, fontWeight: 600 }}>Most Helpful Adaptation</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#E6F4FB", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Line Focus & Spacing
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Reduced visual crowding</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#DCE6F0", lineHeight: 1.5, marginBottom: 20, background: "rgba(255,255,255,0.04)", padding: 12, borderRadius: 10 }}>
          <strong style={{ color: AMBER, display: "block", marginBottom: 2 }}>Session Summary</strong>
          The adaptive reader monitored gaze fixation stability and automatically adjusted line spacing to preserve reading momentum. No visual disruption occurred during transitions.
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onResetSession}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFF",
              padding: "10px 0",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} /> Reset Demo
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: NAVY,
              border: "none",
              color: "#FFF",
              padding: "10px 0",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Reader — Pane + Person C Adaptation Engine + Vitals Sidebar       */
/* ------------------------------------------------------------------ */
function Reader({ file, onClose, themeMode, setThemeMode, rulerEnabled, setRulerEnabled }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [vitalsOpen, setVitalsOpen] = useState(true);

  // Proactive AI annotation layer (one-time pass, never per gaze event)
  const plainText = useMemo(() => file.content || "", [file]);
  const { annotationMap, status: annotationStatus } = useAnnotations(plainText);

  // TTS engine — gaze-independent
  const tts = useTTS();

  // Person C state
  const [activeAdaptation, setActiveAdaptation] = useState("NONE");
  const [notification, setNotification] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [interventionsCount, setInterventionsCount] = useState(0);
  const [signalQuality, setSignalQuality] = useState(92);
  const textContainerRef = useRef(null);
  const lastAdaptationTimeRef = useRef(0);

  const { WORDS, PHASES } = useMemo(() => {
    const paragraphs = file.content
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const safe = paragraphs.length ? paragraphs : [file.content || " "];
    return { WORDS: buildWords(safe), PHASES: derivePhases(buildWords(safe)) };
  }, [file]);

  const [display, setDisplay] = useState(() => PHASES[0]?.metrics ?? {
    fixationMs: 250, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 2, postureShift: 1, wpm: 215,
  });

  const phase = PHASES[phaseIdx] ?? { duration: 4000, metrics: display, mode: "ease", reasons: [] };
  const advancingRef = useRef(true);
  const accRef = useRef(0);
  const waveStateRef = useRef({ turbulence: 0, tone: "ease" });

  useEffect(() => {
    if (!playing || !PHASES.length) return undefined;
    const t = setTimeout(() => setPhaseIdx((i) => (i + 1) % PHASES.length), phase.duration);
    return () => clearTimeout(t);
  }, [phaseIdx, playing, phase.duration, PHASES.length]);

  useEffect(() => {
    if (phase.mode === "struggle") {
      setCursor(phase.targetWord);
      advancingRef.current = false;
    } else {
      advancingRef.current = true;
    }
  }, [phaseIdx, phase.mode, phase.targetWord]);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((prev) => {
        const t = phase.metrics;
        return {
          fixationMs: lerp(prev.fixationMs, t.fixationMs, 0.16),
          regressions: lerp(prev.regressions, t.regressions, 0.16),
          blinkRate: lerp(prev.blinkRate, t.blinkRate, 0.16),
          longClosure: t.longClosure,
          headTilt: lerp(prev.headTilt, t.headTilt, 0.16),
          postureShift: lerp(prev.postureShift, t.postureShift, 0.16),
          wpm: lerp(prev.wpm, t.wpm, 0.12),
        };
      });
      accRef.current += 150;
      const msPerWord = Math.max(220, 60000 / Math.max(60, display.wpm));
      if (advancingRef.current && accRef.current >= msPerWord) {
        accRef.current = 0;
        setCursor((c) => (c + 1) % Math.max(1, WORDS.length));
      }
    }, 150);
    return () => clearInterval(id);
  }, [phase.metrics, display.wpm, WORDS.length]);

  const vitals = useMemo(() => deriveVitals(display), [display]);
  const isStruggling = vitals.composite >= 45 || activeAdaptation !== "NONE";
  const flowScore = Math.max(0, 100 - vitals.composite);
  const isTrackingLowQuality = signalQuality < 45;

  useEffect(() => {
    waveStateRef.current = {
      turbulence: isTrackingLowQuality ? 0 : Math.min(1, vitals.composite / 100),
      tone: isTrackingLowQuality ? "ease" : vitals.composite >= 65 ? "alert" : vitals.composite >= 35 ? "warn" : "ease",
    };
  }, [vitals.composite, isTrackingLowQuality]);

  // Bind #text-container to Person A CV DOM mapper
  useEffect(() => {
    if (window.AdaptiveReaderCV?.setTextRegion) {
      window.AdaptiveReaderCV.setTextRegion("#text-container");
    }
  }, [file]);

  // Refresh text region whenever layout / theme changes
  useEffect(() => {
    if (window.AdaptiveReaderCV?.refreshTextRegion) {
      window.AdaptiveReaderCV.refreshTextRegion();
    }
  }, [themeMode, activeAdaptation, rulerEnabled]);

  // Person B Adaptation Handler with Rapid State Debouncing & Low Signal Quality Gating
  const applyAdaptationRecommendation = useCallback((action, evidence) => {
    const now = Date.now();
    // Requirement 3: Low signal quality gating (freeze adaptations & gaze updates)
    if (signalQuality < 45) return;

    // Requirement 2: Rapid state debouncing (ignore rapid triggers within 350ms)
    if (now - lastAdaptationTimeRef.current < 350 && action === activeAdaptation) {
      return;
    }
    lastAdaptationTimeRef.current = now;

    setActiveAdaptation(action);
    if (action !== "NONE") {
      setNotification({
        action,
        evidence: evidence || ["prolonged_fixation"],
        timestamp: now,
      });
      setInterventionsCount((c) => c + 1);
    } else {
      setNotification(null);
    }
  }, [signalQuality, activeAdaptation]);

  // Listen to Person B state updates and custom simulation events
  useEffect(() => {
    const handleSimulateFriction = () => {
      applyAdaptationRecommendation("FOCUS_LINE", ["prolonged_fixation", "repeated_line_revisit"]);
    };

    const handleResetSession = () => {
      setActiveAdaptation("NONE");
      setNotification(null);
      setSelectedWord(null);
      setInterventionsCount(0);
      setPhaseIdx(0);
    };

    window.addEventListener("simulate-friction", handleSimulateFriction);
    window.addEventListener("reset-session", handleResetSession);

    if (window.ReadingIntelligence?.on) {
      window.ReadingIntelligence.on("onAdaptationRecommendation", (payload) => {
        applyAdaptationRecommendation(
          payload.recommendedAction || "FOCUS_LINE",
          payload.evidence || ["prolonged_fixation"]
        );
      });
      window.ReadingIntelligence.on("onReadingStateUpdate", (payload) => {
        if (typeof payload.signalQuality === "number") {
          setSignalQuality(payload.signalQuality);
        }
      });
    }

    return () => {
      window.removeEventListener("simulate-friction", handleSimulateFriction);
      window.removeEventListener("reset-session", handleResetSession);
    };
  }, [applyAdaptationRecommendation]);

  // Requirement 5: Keyboard Shortcuts & Accessibility Audit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setInsightsOpen(false);
        setSelectedWord(null);
      } else if (e.key === " " && document.activeElement === document.body) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const safeCursor = WORDS.length ? cursor % WORDS.length : 0;
  const currentWord = WORDS[safeCursor] ?? { text: "", clean: "", para: 0 };
  const struggleReasons = phase.mode === "struggle" ? phase.reasons : null;



  const forceStruggle = () => {
    if (!PHASES.length) return;
    const nextStruggle = PHASES.findIndex((p, i) => i > phaseIdx && p.mode === "struggle");
    setPhaseIdx(nextStruggle !== -1 ? nextStruggle : PHASES.findIndex((p) => p.mode === "struggle"));
  };

  // Requirement 1: Comprehensive Person B Adaptation Ladder derivation
  const isFocusMode = themeMode === "Focus" || activeAdaptation === "FOCUS_LINE";
  const isComfortMode = themeMode === "Comfort";
  const isLightSpacing = activeAdaptation === "LIGHT_SPACING";
  const isHighSpacing = themeMode === "High Spacing" || activeAdaptation === "REDUCE_VISUAL_CROWDING";
  const isOfferDefinition = activeAdaptation === "OFFER_DEFINITION";
  const isOfferSimplification = activeAdaptation === "OFFER_SIMPLIFICATION";
  const isOfferTTS = activeAdaptation === "OFFER_TTS";

  const paneBg = isStruggling
    ? "rgba(255, 246, 230, 0.65)"
    : isComfortMode
      ? "rgba(247, 243, 236, 0.70)"
      : "rgba(255, 255, 255, 0.60)";

  const paneTextColor = BROWN;
  const fontSize = isHighSpacing ? 22 : isComfortMode ? 21 : isFocusMode ? 21 : 20;
  const lineHeight = isHighSpacing ? 2.35 : isLightSpacing ? 2.05 : isComfortMode ? 2.15 : isFocusMode ? 2.10 : isStruggling ? 2.15 : 1.85;
  const letterSpacing = isHighSpacing ? "0.035em" : isLightSpacing ? "0.025em" : isComfortMode ? "0.02em" : isFocusMode ? "0.015em" : "normal";
  const wordSpacing = isHighSpacing ? "0.30em" : isLightSpacing ? "0.18em" : isComfortMode ? "0.22em" : isFocusMode ? "0.15em" : "normal";
  const fontFamily = isComfortMode || isHighSpacing ? "Verdana, Tahoma, sans-serif" : "Calibri, sans-serif";
  const maxWidth = isHighSpacing ? 640 : isFocusMode ? 680 : 740;

  const paraIndexes = useMemo(
    () => Array.from(new Set(WORDS.map((w) => w.para))),
    [WORDS]
  );

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      {/* Reading pane */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
        background: "transparent", position: "relative", overflow: "hidden",
      }}>
        <SkyBackgroundDesigns />

        {/* Dynamic Person C Notification Banner */}
        <NotificationBanner
          notification={notification}
          onUndo={() => { setActiveAdaptation("NONE"); setNotification(null); }}
          onReset={() => { setThemeMode("Standard"); setActiveAdaptation("NONE"); setNotification(null); }}
        />

        <div style={{
          ...glassStyle({
            position: "relative", zIndex: 1,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 18px",
            borderRadius: 0,
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
          }),
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: BROWN, fontWeight: 600 }}>
            <FileText size={15} color={NAVY} />
            <span style={{ color: NAVY, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {file.name}
            </span>
            <span style={{ fontSize: 11, background: "rgba(30,58,95,0.12)", padding: "2px 8px", borderRadius: 99, color: NAVY, fontWeight: 700 }}>
              {themeMode}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                setThemeMode("Standard");
                setActiveAdaptation("NONE");
                setNotification(null);
                setSelectedWord(null);
                setInterventionsCount(0);
                setPhaseIdx(0);
                setCursor(0);
              }}
              title="Reset reading demo to initial state"
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: NAVY, background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(30,58,95,0.18)", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer",
              }}
            >
              <RotateCcw size={13} color={NAVY} /> Reset Demo
            </button>
            <button
              onClick={() => setInsightsOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: NAVY, background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(30,58,95,0.18)", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer",
              }}
            >
              <Activity size={13} color={AMBER} /> Session Insights
            </button>
            <button
              onClick={onClose}
              title="Close file and return to launcher"
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
                color: NAVY, background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(30,58,95,0.18)", borderRadius: 8,
                padding: "6px 10px", cursor: "pointer",
                backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
              }}
            >
              <Upload size={14} /> Open another
            </button>
          </div>
        </div>

        {/* Main Reading Canvas Pane — ID #text-container for Person A & B integration */}
        <div style={{
          position: "relative", zIndex: 1,
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "36px 48px", overflow: "auto",
        }}>
          <div
            id="text-container"
            ref={textContainerRef}
            style={{
              position: "relative", zIndex: 1,
              maxWidth, width: "100%", background: paneBg, borderRadius: 18,
              padding: "48px 52px",
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow:
                "0 8px 32px 0 rgba(0,0,0,0.37), " +
                "inset 0 1px 0 0 rgba(255,255,255,0.65), " +
                "inset 0 0 20px 0 rgba(255,255,255,0.10)",
              backdropFilter: GLASS_BLUR,
              WebkitBackdropFilter: GLASS_BLUR,
              transition: "background 450ms ease, max-width 450ms cubic-bezier(0.4, 0, 0.2, 1)",
              overflow: "hidden",
            }}
          >
            <TopGlassHighlight opacity={0.9} />

            {/* Reading Ruler overlay bar (frozen when tracking low quality) */}
            {rulerEnabled && !isTrackingLowQuality && (
              <div
                className="reading-ruler-bar"
                style={{ top: `${Math.min(85, (currentWord.para + 1) * 28)}%` }}
              />
            )}

            {WORDS.length === 0 ? (
              <p style={{ margin: 0, fontSize: 16, color: BROWN, fontFamily: "Calibri, sans-serif" }}>
                This file is empty.
              </p>
            ) : (
              paraIndexes.map((pIdx, idx) => {
                const isCurrentPara = pIdx === currentWord.para;
                const paraFaded = isFocusMode && !isCurrentPara && !isTrackingLowQuality;

                return (
                  <p
                    key={pIdx}
                    className={paraFaded ? "reading-line-faded" : isCurrentPara && isFocusMode ? "reading-line-focused" : ""}
                    style={{
                      margin: 0, marginBottom: idx === paraIndexes.length - 1 ? 0 : isHighSpacing ? 36 : 28,
                      fontFamily, fontSize, lineHeight, letterSpacing, wordSpacing, color: paneTextColor,
                      padding: isCurrentPara && isFocusMode ? "8px 12px" : "0",
                      transition: "all 400ms ease",
                    }}
                  >
                    {WORDS.filter((w) => w.para === pIdx).map((w) => {
                      const active = w.id === safeCursor;
                      const struggling = active && isStruggling && !isTrackingLowQuality;
                      const isSelected = selectedWord?.id === w.id;
                      const wordAnnotation = resolveWordAnnotation(w, WORDS, annotationMap);
                      const isAnnotated = !!wordAnnotation && !isSelected && !struggling;

                      return (
                        <span key={w.id} style={{ position: "relative" }}>
                          <span
                            onClick={() => setSelectedWord(w)}
                            style={{
                              background: isSelected
                                ? "rgba(232,163,61,0.45)"
                                : struggling
                                  ? AMBER
                                  : active
                                    ? "rgba(95,168,211,0.28)"
                                    : "transparent",
                              borderRadius: 4,
                              padding: struggling || isSelected ? "1px 4px" : 0,
                              boxShadow: struggling || isSelected ? `0 0 0 3px rgba(232,163,61,0.28)` : "none",
                              cursor: "pointer",
                              transition: "all 250ms ease",
                              // Subtle annotation underline — calm, not distracting
                              borderBottom: isAnnotated
                                ? wordAnnotation.type === "key_term"
                                  ? "1.5px dotted rgba(30,58,95,0.55)"
                                  : wordAnnotation.type === "important_concept"
                                  ? "1.5px solid rgba(95,168,211,0.65)"
                                  : "1px dashed rgba(30,58,95,0.38)"
                                : "none",
                            }}
                            title={isAnnotated ? wordAnnotation.reason : "Click for contextual assist"}
                          >
                            {w.text}
                          </span>{" "}
                        </span>
                      );
                    })}
                  </p>
                );
              })
            )}

            {/* Contextual Assist Panel — replaces old inline word card */}
            {(selectedWord || isOfferDefinition || isOfferSimplification || isOfferTTS || (struggleReasons && currentWord.clean)) && (() => {
              const target = selectedWord ?? (currentWord.clean ? currentWord : null);
              if (!target) return null;
              const annotation = resolveWordAnnotation(target, WORDS, annotationMap)
                ?? (isOfferSimplification ? {
                    type: "important_concept",
                    reason: "Plain language summary requested",
                    explanation: "Dyslexia alters reading speed, but adaptive tools widen spacing and highlight key focus lines to lower cognitive load.",
                  } : null);
              return (
                <ContextualAssistPanel
                  word={target}
                  annotation={annotation}
                  onDismiss={() => setSelectedWord(null)}
                  tts={{
                    ...tts,
                    speakSentence: (id) => tts.speakSentence(id, WORDS),
                  }}
                />
              );
            })()}

            {/* Annotation status badge — subtle, top-right corner */}
            {annotationStatus === "loading" && (
              <div style={{
                position: "absolute", top: 16, right: 18,
                fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: AMBER, display: "inline-block",
                  animation: "pulseGlow 1.4s ease-in-out infinite",
                }} />
                Analysing…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vitals Sidebar — Person B Metrics & Flow Score */}
      <div style={{
        ...glassDarkStyle({
          width: vitalsOpen ? 280 : 44,
          flexShrink: 0,
          borderLeft: "1px solid rgba(255,255,255,0.10)",
          borderTop: "none",
          borderBottom: "none",
          borderRight: "none",
          borderRadius: 0,
          padding: vitalsOpen ? "20px 18px" : "16px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: vitalsOpen ? "stretch" : "center",
          gap: 14,
          transition: "width 250ms ease, padding 250ms ease",
        }),
      }}>
        {vitalsOpen ? (
          <>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: AMBER }}>READING INTELLIGENCE</div>
              <div style={{ fontSize: 10.5, color: MUTED_DARK, marginTop: 2 }}>Real-time gaze & friction stream</div>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              padding: 16,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {isTrackingLowQuality ? (
                  <AlertTriangle size={18} color={AMBER} />
                ) : isStruggling ? (
                  <AlertTriangle size={18} color={AMBER} />
                ) : (
                  <CheckCircle2 size={18} color={SAGE} />
                )}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "Cambria, serif" }}>
                    {isTrackingLowQuality
                      ? "Tracking Paused"
                      : isStruggling
                        ? "Focus Assist Active"
                        : "Reading Flow Smooth"}
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED_DARK }}>
                    {isTrackingLowQuality
                      ? "Low camera signal quality"
                      : `Paragraph ${currentWord.para + 1} · word “${currentWord.text.replace(/[^a-zA-Z]/g, "")}”`}
                  </div>
                </div>
              </div>

              <FlowWave stateRef={waveStateRef} />

              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "Consolas, monospace", fontSize: 26, fontWeight: 700, color: isTrackingLowQuality ? AMBER : SAGE }}>
                    {flowScore}%
                  </div>
                  <div style={{ fontSize: 10, color: MUTED_DARK }}>Reading Flow Index</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: isTrackingLowQuality ? AMBER : SAGE }}>
                    {isTrackingLowQuality ? "Paused" : "Tracking Active"}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED_DARK }}>signal quality</div>
                </div>
              </div>

              {struggleReasons && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: AMBER, marginBottom: 6 }}>FRICTION SIGNALS</div>
                  {struggleReasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#DCE6F0", marginBottom: 4, display: "flex", gap: 6 }}>
                      <span style={{ color: AMBER }}>•</span> {r}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 11.5, fontWeight: 600, color: "#E6F4FB",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "8px 0", cursor: "pointer",
                    backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
                  }}
                >
                  {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={forceStruggle}
                  style={{
                    flex: 1.3, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 11.5, fontWeight: 600, color: "#241A08", background: AMBER,
                    border: "none", borderRadius: 8, padding: "8px 0", cursor: "pointer",
                  }}
                >
                  <RotateCcw size={12} /> Trigger Friction
                </button>
              </div>

              <button
                onClick={() => setInsightsOpen(true)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  fontSize: 11.5, fontWeight: 600, color: "#FFF", background: "rgba(30,58,95,0.60)",
                  border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "8px 0", cursor: "pointer",
                }}
              >
                <Activity size={13} color={SKY} /> Session Insights
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setVitalsOpen(true)}
            title="Expand vitals sidebar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)", color: "#E6F4FB", cursor: "pointer", marginTop: 8,
              backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
            }}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
      </div>

      {/* Session Insights Summary Modal */}
      <SessionInsightsModal
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        flowScore={flowScore}
        interventionsCount={interventionsCount}
        onResetSession={() => {
          setActiveAdaptation("NONE");
          setNotification(null);
          setSelectedWord(null);
          setInterventionsCount(0);
          setInsightsOpen(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Webcam status hook                                                  */
/* ------------------------------------------------------------------ */
function useWebcamStatus() {
  const [state, setState] = useState({ status: "checking", message: "Detecting webcam…" });

  useEffect(() => {
    let stream;
    let cancelled = false;
    (async () => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        if (!cancelled) setState({ status: "off", message: "Camera API unavailable" });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!cancelled) setState({ status: "on", message: "Webcam active" });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "off",
            message: e?.name === "NotAllowedError" ? "Camera permission denied" : "No webcam detected",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------------ */
/* Top header — Person C Product Controls                              */
/* ------------------------------------------------------------------ */
function TopHeader({ webcam, themeMode, setThemeMode, rulerEnabled, setRulerEnabled, onSimulateFriction, onLoadDemo, onResetSession }) {
  const camColor = webcam.status === "on" ? SAGE : webcam.status === "off" ? BRICK : AMBER;
  const themes = ["Standard", "Focus", "Comfort", "High Spacing"];

  return (
    <header style={{
      ...glassDarkStyle({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 22px",
        borderRadius: 0,
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
        color: "#fff",
        flexShrink: 0,
        gap: 16,
      }),
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: "rgba(95,168,211,0.55)",
          border: "1px solid rgba(255,255,255,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
        }}>
          <Waves size={17} color="#E6F4FB" />
        </div>
        <div>
          <div style={{ fontFamily: "Cambria, serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1, color: "#F2F8FC" }}>
            Adaptive Reader
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(220,230,240,0.75)", letterSpacing: 0.5 }}>
            Reading flow companion
          </div>
        </div>
      </div>

      {/* Reading Theme Selector & Control Pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", padding: "4px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: AMBER, marginRight: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <SlidersHorizontal size={12} /> THEME
        </span>
        {themes.map((t) => {
          const active = themeMode === t;
          return (
            <button
              key={t}
              onClick={() => setThemeMode(t)}
              style={{
                background: active ? "rgba(95,168,211,0.35)" : "transparent",
                border: `1px solid ${active ? "rgba(95,168,211,0.60)" : "transparent"}`,
                color: active ? "#FFF" : MUTED_DARK,
                borderRadius: 7,
                padding: "4px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 180ms ease",
              }}
            >
              {t}
            </button>
          );
        })}
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
        <button
          onClick={() => setRulerEnabled(!rulerEnabled)}
          style={{
            background: rulerEnabled ? "rgba(232,163,61,0.28)" : "transparent",
            border: `1px solid ${rulerEnabled ? AMBER : "transparent"}`,
            color: rulerEnabled ? "#FFF" : MUTED_DARK,
            borderRadius: 7,
            padding: "4px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Layers size={12} color={rulerEnabled ? AMBER : MUTED_DARK} /> Ruler
        </button>
      </div>

      {/* Stage & Demo Quick Triggers */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onLoadDemo}
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#E6F4FB",
            borderRadius: 8,
            padding: "6px 11px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
          title="Load one-click demo passage"
        >
          <BookOpen size={13} color={SKY} /> Demo Passage
        </button>
        <button
          onClick={onSimulateFriction}
          style={{
            background: "rgba(232,163,61,0.20)",
            border: "1px solid rgba(232,163,61,0.45)",
            color: "#FFF",
            borderRadius: 8,
            padding: "6px 11px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
          title="Simulate friction trigger to test Person B adaptation"
        >
          <Zap size={13} color={AMBER} /> Simulate Friction
        </button>
        <button
          onClick={onResetSession}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: MUTED_DARK,
            borderRadius: 8,
            padding: "6px 9px",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          title="Reset session and calibrations"
        >
          <RefreshCw size={12} />
        </button>

        {/* Camera / Signal Health Badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 12px", borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
        }} title={webcam.message}>
          <Camera size={14} color={camColor} />
          <span style={{ width: 8, height: 8, borderRadius: 99, background: camColor, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#E6F4FB" }}>
            {webcam.status === "checking" ? "Checking camera…" : webcam.message}
          </span>
        </div>
      </div>
    </header>
  );
}

const DEMO_DOCUMENT = {
  id: "demo-passage-1",
  name: "Dyslexia & Reading Neuroscience.txt",
  size: 1420,
  content: `Dyslexia is a neurodevelopmental variation that affects how the brain decodes written language. It is unrelated to intelligence, vision quality, or effort.

When reading a complex line of text, individuals with dyslexia often experience visual crowding, prolonged ocular fixations, and frequent backward regressions.

The phenomenon emerges from altered phonological processing speed in the left hemisphere's reading network. Traditional static fonts and dense text layouts force the reader to spend excessive cognitive energy on decoding rather than comprehension.

By continuously observing ocular cadence and reading friction in real time, the adaptive reading interface dynamically widens line spacing, isolates the active focus line, and surfaces contextual plain-language explanations right when hesitation occurs.`
};

/* ------------------------------------------------------------------ */
/* Top-level shell                                                     */
/* ------------------------------------------------------------------ */
export default function AdaptiveReaderUI() {
  const [history, setHistory] = useState(() => loadHistory());
  const [activeFile, setActiveFile] = useState(() => loadActive() || DEMO_DOCUMENT);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [themeMode, setThemeMode] = useState("Standard");
  const [rulerEnabled, setRulerEnabled] = useState(false);
  const webcam = useWebcamStatus();

  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { saveActive(activeFile); }, [activeFile]);

  const openFile = useCallback((file) => {
    const id = `${file.name}::${file.size}::${Date.now()}`;
    const entry = { id, name: file.name, size: file.size, content: file.content, openedAt: Date.now() };
    setHistory((prev) => {
      const dedup = prev.filter((p) => !(p.name === entry.name && p.size === entry.size));
      return [entry, ...dedup].slice(0, 25);
    });
    setActiveFile(entry);
  }, []);

  const openFromHistory = useCallback((item) => {
    setActiveFile({ ...item, openedAt: Date.now() });
    setHistory((prev) => {
      const others = prev.filter((p) => p.id !== item.id);
      return [{ ...item, openedAt: Date.now() }, ...others].slice(0, 25);
    });
  }, []);

  const loadDemoPassage = useCallback(() => {
    setActiveFile(DEMO_DOCUMENT);
  }, []);

  const simulateFriction = useCallback(() => {
    if (window.ReadingIntelligence?.triggerProactiveAssist) {
      window.ReadingIntelligence.triggerProactiveAssist(0, "FOCUS_LINE");
    } else {
      window.dispatchEvent(new CustomEvent("simulate-friction"));
    }
  }, []);

  const resetSession = useCallback(() => {
    if (window.ReadingIntelligence?.reset) {
      window.ReadingIntelligence.reset();
    }
    setThemeMode("Standard");
    setRulerEnabled(false);
    window.dispatchEvent(new CustomEvent("reset-session"));
  }, []);

  const removeFromHistory = useCallback((id) => {
    setHistory((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);
  const closeActive = useCallback(() => setActiveFile(null), []);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh", width: "100%",
      fontFamily: "Calibri, sans-serif",
      background: "linear-gradient(155deg, #101E2E 0%, #1A3455 32%, #3878A3 68%, #91C0DE 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      <TopHeader
        webcam={webcam}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        rulerEnabled={rulerEnabled}
        setRulerEnabled={setRulerEnabled}
        onSimulateFriction={simulateFriction}
        onLoadDemo={loadDemoPassage}
        onResetSession={resetSession}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <HistorySidebar
          open={historyOpen}
          items={history}
          activeId={activeFile?.id}
          onOpen={openFromHistory}
          onRemove={removeFromHistory}
          onClear={clearHistory}
          onToggle={() => setHistoryOpen((o) => !o)}
        />

        <main style={{ flex: 1, display: "flex", minWidth: 0, position: "relative", overflow: "hidden" }}>
          {!activeFile ? (
            <Landing onOpen={openFile} onPickFromHistory={history.length > 0} />
          ) : (
            <Reader
              file={activeFile}
              onClose={closeActive}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              rulerEnabled={rulerEnabled}
              setRulerEnabled={setRulerEnabled}
            />
          )}
        </main>
      </div>
    </div>
  );
}
