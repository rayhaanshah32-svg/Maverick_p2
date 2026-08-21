/**
 * useOllama.js — Ollama local LLM integration for Adaptive Reader
 *
 * Connects to a locally running Ollama instance (http://localhost:11434)
 * using the qwen2.5:7b model.
 *
 * Use cases:
 *  - ASSIST state: suggest a simpler synonym for a difficult word
 *  - Give plain-language definition
 *  - Generate simplified version of a sentence
 *
 * IMPORTANT: Never called in the gaze loop. Only triggered manually
 * by OFFER_SIMPLIFICATION / OFFER_DEFINITION actions or explicit user request.
 */
import { useState, useCallback } from "react";

const OLLAMA_BASE = "http://localhost:11434";
const MODEL = "qwen2.5:7b";

async function ollamaGenerate(prompt) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return (json.response ?? "").trim();
}

export function useOllama() {
  const [ollamaStatus, setOllamaStatus] = useState("idle");
  // idle | loading | done | error | unavailable

  const [ollamaResult, setOllamaResult] = useState(null);

  const askSimplify = useCallback(async (sentence) => {
    if (!sentence?.trim()) return;
    setOllamaStatus("loading");
    setOllamaResult(null);
    try {
      const text = await ollamaGenerate(
        `You are a plain-language reading assistant. Rewrite this sentence in simpler words. Output only the rewritten sentence, nothing else:\n\n"${sentence.trim()}"`
      );
      setOllamaResult({ type: "simplification", text });
      setOllamaStatus("done");
      return text;
    } catch (e) {
      console.warn("[useOllama] Ollama unavailable:", e);
      setOllamaStatus("unavailable");
      return null;
    }
  }, []);

  const askDefine = useCallback(async (word) => {
    if (!word?.trim()) return;
    setOllamaStatus("loading");
    setOllamaResult(null);
    try {
      const text = await ollamaGenerate(
        `Define the word "${word.trim()}" in one plain, simple sentence a child could understand. Output only the definition.`
      );
      setOllamaResult({ type: "definition", word, text });
      setOllamaStatus("done");
      return text;
    } catch (e) {
      console.warn("[useOllama] Ollama unavailable:", e);
      setOllamaStatus("unavailable");
      return null;
    }
  }, []);

  const askSynonym = useCallback(async (word) => {
    if (!word?.trim()) return;
    setOllamaStatus("loading");
    setOllamaResult(null);
    try {
      const text = await ollamaGenerate(
        `Give one simple, common synonym for the word "${word.trim()}". Output only the synonym word.`
      );
      setOllamaResult({ type: "synonym", word, text });
      setOllamaStatus("done");
      return text;
    } catch (e) {
      console.warn("[useOllama] Ollama unavailable:", e);
      setOllamaStatus("unavailable");
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setOllamaStatus("idle");
    setOllamaResult(null);
  }, []);

  return {
    ollamaStatus,
    ollamaResult,
    askSimplify,
    askDefine,
    askSynonym,
    clear,
  };
}
