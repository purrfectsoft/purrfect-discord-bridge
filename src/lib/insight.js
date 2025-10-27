import OpenAI from "openai";
import { redact } from "../redact.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Build a short, leadership-friendly interpretation (120–180 words).
 * Only use the provided numbers; do not invent data.
 */
export async function buildAIOpinion({ guildName, range, totals, channels, authors }) {
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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: "You write concise, quantitative ops summaries." },
      { role: "user", content: redact(prompt) }
    ],
    temperature: 0.3,
    max_tokens: 300
  });

  return res.choices?.[0]?.message?.content?.trim() || "";
}
