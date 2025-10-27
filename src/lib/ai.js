// src/lib/ai.js
import OpenAI from "openai";
import { redact } from "../redact.js";

let _client = null;
let _clientWarned = false;

/** Lazy singleton OpenAI client. Returns null when OPENAI_API_KEY is missing. */
export function getOpenAI() {
  if (_client) return _client;
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    _clientWarned = false; // reset so we warn once after a key appears but fails
    return null; // graceful: callers should skip AI features
  }
  try {
    _client = new OpenAI({ apiKey });
    _clientWarned = false;
  } catch (err) {
    _client = null;
    if (!_clientWarned && process.env.NODE_ENV !== "test") {
      console.warn("OpenAI client unavailable:", err?.message || err);
      _clientWarned = true;
    }
    return null;
  }
  return _client;
}

/** Single place to choose the model. */
export function getModel(kind = "summary") {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

/** Redact helper wrapped for convenience/consistency. */
export function redactSafe(text) {
  try {
    return redact(text);
  } catch {
    return text;
  }
}
