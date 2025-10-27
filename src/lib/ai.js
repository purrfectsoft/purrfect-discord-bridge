// src/lib/ai.js
import OpenAI from "openai";
import { redact } from "../redact.js";

let _client = null;

/** Lazy singleton OpenAI client. Returns null when OPENAI_API_KEY is missing. */
export function getOpenAI() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // graceful: callers should skip AI features
  _client = new OpenAI({ apiKey });
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
