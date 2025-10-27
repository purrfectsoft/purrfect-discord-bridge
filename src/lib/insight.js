// src/lib/insight.js
import { getOpenAI, getModel, redactSafe } from "./ai.js";

/**
 * Build a short leadership-friendly interpretation (120–180 words).
 * Uses only provided numbers. Returns "" when AI is unavailable.
 */
export async function buildAIOpinion({ guildName, range, totals, channels, authors }) {
  const client = getOpenAI();
  if (!client) return ""; // no OPENAI_API_KEY → skip insight

  const prompt = [
    "You are an analyst for a humane, transparent company community on Discord.",
    "Summarize trends succinctly for leadership (120–180 words).",
    "Focus on: momentum (up/down), standout channels, top contributor changes, and any risk flags (drops, concentration).",
    "Tone: neutral-positive, practical. End with 2 short actionable suggestions.",
    "",
    `Guild: ${guildName}`,
    `Range: ${range}`,
    `Totals: ${JSON.stringify(totals)}`,
    `Top channel movers (first 10): ${JSON.stringify((channels || []).slice(0, 10))}`,
    `Top author movers (first 10): ${JSON.stringify((authors || []).slice(0, 10))}`
  ].join("\n");

  const res = await client.chat.completions.create({
    model: getModel("insight"),
    messages: [
      { role: "system", content: "You write concise, quantitative ops summaries." },
      { role: "user", content: redactSafe(prompt) }
    ],
    temperature: 0.3,
    max_tokens: 300
  });

  return res.choices?.[0]?.message?.content?.trim() || "";
}
