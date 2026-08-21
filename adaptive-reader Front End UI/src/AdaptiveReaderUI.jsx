import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Eye, EyeOff, Compass, Timer, Activity, AlertTriangle, CheckCircle2,
  Volume2, Play, Pause, RotateCcw, Waves, FileText, Camera,
  PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen, Upload, BookOpen, Clock, Trash2, X,
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
    { id: "ease-1", mode: "ease", duration: 5500,
      metrics: { fixationMs: 250, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 2, postureShift: 1, wpm: 212 } },
    { id: "struggle-fixation", mode: "struggle", duration: 6500, targetWord: findWord("fighting"),
      metrics: { fixationMs: 1380, regressions: 4, blinkRate: 14, longClosure: false, headTilt: 3, postureShift: 1, wpm: 118 },
      reasons: ["Fixation held ~1.4s on one word — 5× the reader's baseline", "3 backward regressions inside a 6-second window"] },
    { id: "ease-2", mode: "ease", duration: 4000,
      metrics: { fixationMs: 260, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 214 } },
    { id: "struggle-blink", mode: "struggle", duration: 6000, targetWord: findWord("backward"),
      metrics: { fixationMs: 520, regressions: 1, blinkRate: 4, longClosure: true, headTilt: 3, postureShift: 1, wpm: 150 },
      reasons: ["Blink rate dropped to 4/min (baseline 17/min)", "One 480ms extended eye-closure detected"] },
    { id: "ease-3", mode: "ease", duration: 5000,
      metrics: { fixationMs: 245, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 2, postureShift: 1, wpm: 216 } },
    { id: "struggle-posture", mode: "struggle", duration: 6000, targetWord: findWord("steadily"),
      metrics: { fixationMs: 610, regressions: 2, blinkRate: 15, longClosure: false, headTilt: 14, postureShift: 6, wpm: 172 },
      reasons: ["Head tilt reached 14° off the reading plane", "Leaned back roughly 6cm from the screen"] },
    { id: "ease-4", mode: "ease", duration: 4500,
      metrics: { fixationMs: 255, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 213 } },
    { id: "struggle-pace", mode: "struggle", duration: 6500, targetWord: findWord("letters"),
      metrics: { fixationMs: 310, regressions: 1, blinkRate: 16, longClosure: false, headTilt: 3, postureShift: 1, wpm: 95 },
      reasons: ["Reading pace 55% below the benchmark for this line", "No single fixation spike — a sustained, steady drag"] },
    { id: "ease-5", mode: "ease", duration: 5000,
      metrics: { fixationMs: 250, regressions: 1, blinkRate: 17, longClosure: false, headTilt: 2, postureShift: 1, wpm: 215 } },
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

/* ------------------------------------------------------------------ */
/* Subtle transparent background pattern                               */
/* ------------------------------------------------------------------ */
const PATTERN_BG = [
  `radial-gradient(circle at 12% 18%, rgba(255,255,255,0.45) 0, transparent 38%)`,
  `radial-gradient(circle at 88% 82%, rgba(30,58,95,0.10) 0, transparent 42%)`,
  `radial-gradient(circle at 50% 50%, rgba(95,168,211,0.10) 0, transparent 60%)`,
].join(", ");

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
        background: SKY_BG,
        backgroundImage: PATTERN_BG,
        backgroundRepeat: "no-repeat",
        padding: 40,
        minHeight: "100vh",
      }}
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: `1px dashed ${dragOver ? NAVY : "rgba(30,58,95,0.35)"}`,
          borderRadius: 18,
          padding: "40px 36px",
          textAlign: "center",
          boxShadow: "0 12px 32px rgba(20,30,45,0.10)",
          transition: "border-color 200ms ease, background 200ms ease",
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: NAVY,
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
        width: open ? W : 44,
        flexShrink: 0,
        background: NAVY_DARK,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        transition: "width 250ms ease",
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
                    background: isActive ? "rgba(232,163,61,0.16)" : "transparent",
                    border: `1px solid ${isActive ? AMBER : "transparent"}`,
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
/* Reader — pane + vitals sidebar                                      */
/* ------------------------------------------------------------------ */
function Reader({ file, onClose }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(true);

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
  const isStruggling = vitals.composite >= 45;

  useEffect(() => {
    waveStateRef.current = {
      turbulence: Math.min(1, vitals.composite / 100),
      tone: vitals.composite >= 65 ? "alert" : vitals.composite >= 35 ? "warn" : "ease",
    };
  }, [vitals.composite]);

  const safeCursor = WORDS.length ? cursor % WORDS.length : 0;
  const currentWord = WORDS[safeCursor] ?? { text: "", clean: "", para: 0 };
  const struggleReasons = phase.mode === "struggle" ? phase.reasons : null;

  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const forceStruggle = () => {
    if (!PHASES.length) return;
    const nextStruggle = PHASES.findIndex((p, i) => i > phaseIdx && p.mode === "struggle");
    setPhaseIdx(nextStruggle !== -1 ? nextStruggle : PHASES.findIndex((p) => p.mode === "struggle"));
  };

  const paneBg = isStruggling ? TINT : BEIGE;
  const paneTextColor = BROWN;
  const lineHeight = isStruggling ? 2.15 : 1.85;
  const letterSpacing = isStruggling ? "0.02em" : "normal";
  const wordSpacing = isStruggling ? "0.22em" : "normal";
  const fontFamily = isStruggling ? "Verdana, Tahoma, sans-serif" : "Calibri, sans-serif";

  const paraIndexes = useMemo(
    () => Array.from(new Set(WORDS.map((w) => w.para))),
    [WORDS]
  );

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      {/* Reading pane */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
        background: SKY_BG, backgroundImage: PATTERN_BG, backgroundRepeat: "no-repeat",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 24px", borderBottom: "1px solid rgba(20,30,45,0.08)",
          background: SKY_HEADER,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: BROWN, fontWeight: 600 }}>
            <FileText size={15} color={NAVY} />
            <span style={{ color: NAVY, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {file.name}
            </span>
          </div>
          <button
            onClick={onClose}
            title="Close file and return to launcher"
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
              color: NAVY, background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(30,58,95,0.25)", borderRadius: 8,
              padding: "6px 10px", cursor: "pointer",
            }}
          >
            <Upload size={14} /> Open another
          </button>
        </div>

        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "40px 56px", overflow: "auto",
        }}>
          <div style={{
            maxWidth: 720, width: "100%", background: paneBg, borderRadius: 18,
            padding: "48px 52px", boxShadow: "0 12px 32px rgba(20,30,45,0.10)",
            transition: "background 500ms ease",
          }}>
            {WORDS.length === 0 ? (
              <p style={{ margin: 0, fontSize: 16, color: BROWN, fontFamily: "Calibri, sans-serif" }}>
                This file is empty.
              </p>
            ) : (
              paraIndexes.map((pIdx, idx) => (
                <p
                  key={pIdx}
                  style={{
                    margin: 0, marginBottom: idx === paraIndexes.length - 1 ? 0 : 28,
                    fontFamily, fontSize: 20, lineHeight, letterSpacing, wordSpacing, color: paneTextColor,
                    transition: "line-height 500ms ease, letter-spacing 500ms ease, font-family 500ms ease",
                  }}
                >
                  {WORDS.filter((w) => w.para === pIdx).map((w) => {
                    const active = w.id === safeCursor;
                    const struggling = active && isStruggling;
                    return (
                      <span key={w.id} style={{ position: "relative" }}>
                        <span
                          style={{
                            background: struggling ? AMBER : active ? "rgba(95,168,211,0.28)" : "transparent",
                            borderRadius: 4,
                            padding: struggling ? "1px 4px" : 0,
                            boxShadow: struggling ? `0 0 0 3px rgba(232,163,61,0.28)` : "none",
                            transition: "all 300ms ease",
                          }}
                        >
                          {w.text}
                        </span>{" "}
                      </span>
                    );
                  })}
                </p>
              ))
            )}

            {struggleReasons && currentWord.clean && (
              <div style={{
                marginTop: 30, padding: "16px 18px", borderRadius: 12,
                background: "#FFFFFF", border: `1px solid ${AMBER}`,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>
                    Stuck on “{currentWord.text.replace(/[^a-zA-Z]/g, "")}”
                  </div>
                  <button
                    onClick={() => speak(currentWord.clean)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
                      color: "#fff", background: NAVY, border: "none", borderRadius: 999,
                      padding: "6px 12px", cursor: "pointer",
                    }}
                  >
                    <Volume2 size={13} /> {speaking ? "Speaking…" : "Read aloud"}
                  </button>
                </div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                  {DEFAULT_DEFINITIONS[currentWord.clean] || "a word in the current passage"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vitals sidebar (existing) */}
      <div style={{
        width: vitalsOpen ? 280 : 44, flexShrink: 0, background: NAVY_DARK,
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        padding: vitalsOpen ? "20px 18px" : "16px 0", display: "flex", flexDirection: "column",
        alignItems: vitalsOpen ? "stretch" : "center", gap: 14,
        transition: "width 250ms ease, padding 250ms ease",
      }}>
        {vitalsOpen ? (
          <>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: AMBER }}>READING VITALS</div>
              <div style={{ fontSize: 10.5, color: MUTED_DARK, marginTop: 2 }}>Live signal from the reading session</div>
            </div>

            <div style={{ background: NAVY_PANEL, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {isStruggling ? <AlertTriangle size={18} color={AMBER} /> : <CheckCircle2 size={18} color={SAGE} />}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "Cambria, serif" }}>
                    {isStruggling ? "Struggling" : "Reading with ease"}
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED_DARK }}>
                    Paragraph {currentWord.para + 1} · word “{currentWord.text.replace(/[^a-zA-Z]/g, "")}”
                  </div>
                </div>
              </div>

              <FlowWave stateRef={waveStateRef} />

              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "Consolas, monospace", fontSize: 26, fontWeight: 700, color: "#fff" }}>
                    {vitals.composite}
                    <span style={{ fontSize: 12, color: MUTED_DARK, fontWeight: 400 }}>/100</span>
                  </div>
                  <div style={{ fontSize: 10, color: MUTED_DARK }}>Composite struggle score</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: SKY }}>{vitals.confidence}</div>
                  <div style={{ fontSize: 10, color: MUTED_DARK }}>confidence</div>
                </div>
              </div>

              {struggleReasons && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: AMBER, marginBottom: 6 }}>WHY IT WAS FLAGGED</div>
                  {struggleReasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#DCE6F0", marginBottom: 4, display: "flex", gap: 6 }}>
                      <span style={{ color: AMBER }}>•</span> {r}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 11.5, fontWeight: 600, color: "#fff", background: NAVY_PANEL,
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 0", cursor: "pointer",
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
                  <RotateCcw size={12} /> Force struggle
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            onClick={() => setVitalsOpen(true)}
            title="Expand vitals sidebar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)",
              background: NAVY_PANEL, color: "#fff", cursor: "pointer", marginTop: 8,
            }}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
      </div>
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
/* Top header                                                          */
/* ------------------------------------------------------------------ */
function TopHeader({ webcam }) {
  const camColor = webcam.status === "on" ? SAGE : webcam.status === "off" ? BRICK : AMBER;
  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 22px",
      background: NAVY,
      borderBottom: `1px solid ${NAVY_DARK}`,
      color: "#fff",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: SKY,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Waves size={17} color={NAVY_DARK} />
        </div>
        <div>
          <div style={{ fontFamily: "Cambria, serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
            Adaptive Reader
          </div>
          <div style={{ fontSize: 10.5, color: MUTED_DARK, letterSpacing: 0.5 }}>
            Reading flow companion
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
      }} title={webcam.message}>
        <Camera size={14} color={camColor} />
        <span style={{ width: 8, height: 8, borderRadius: 99, background: camColor, display: "inline-block" }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#DCE6F0" }}>
          {webcam.status === "checking" ? "Checking camera…" : webcam.message}
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Top-level shell                                                     */
/* ------------------------------------------------------------------ */
export default function AdaptiveReaderUI() {
  const [history, setHistory] = useState(() => loadHistory());
  const [activeFile, setActiveFile] = useState(() => loadActive());
  const [historyOpen, setHistoryOpen] = useState(true);
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

  const removeFromHistory = useCallback((id) => {
    setHistory((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);
  const closeActive = useCallback(() => setActiveFile(null), []);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh", width: "100%",
      fontFamily: "Calibri, sans-serif", background: SKY_BG,
    }}>
      <TopHeader webcam={webcam} />
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

        <main style={{ flex: 1, display: "flex", minWidth: 0, backgroundImage: PATTERN_BG, backgroundRepeat: "no-repeat" }}>
          {!activeFile ? (
            <Landing onOpen={openFile} onPickFromHistory={history.length > 0} />
          ) : (
            <Reader file={activeFile} onClose={closeActive} />
          )}
        </main>
      </div>
    </div>
  );
}
