// src/notes.js
import fs from "fs";
import path from "path";
import { redact } from "./redact.js";

const dataDir = process.env.DATA_DIR || "./data";
const notesDir = path.join(dataDir, "notes");

export function ensureNotesDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir);
}

function notesPath(dayISO) {
  return path.join(notesDir, `${dayISO}.json`);
}

/**
 * Add a manual note (PII is redacted here as a safety net).
 */
export function addNote({
  timestampISO,
  author,
  authorId,
  channelId,
  section = "Manual Notes",
  text
}) {
  ensureNotesDir();
  const safeText = redact(String(text || "").trim());
  if (!safeText) return;

  const dayISO = (timestampISO || new Date().toISOString()).slice(0, 10);
  const file = notesPath(dayISO);

  let arr = [];
  if (fs.existsSync(file)) {
    try { arr = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  }

  arr.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: timestampISO || new Date().toISOString(),
    author: author || "Unknown",
    authorId: authorId || "unknown",
    channelId: channelId || null,
    section,
    text: safeText
  });

  fs.writeFileSync(file, JSON.stringify(arr, null, 2));
}

/**
 * Load notes between two ISO timestamps (inclusive), sorted by time.
 */
export function getNotesBetween({ sinceISO, untilISO }) {
  ensureNotesDir();
  const since = new Date(sinceISO);
  const until = new Date(untilISO);

  // collect day files across the date range
  const days = [];
  for (
    let d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
    d <= until;
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }

  const all = [];
  for (const day of days) {
    const file = notesPath(day);
    if (!fs.existsSync(file)) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const n of arr) {
        const t = new Date(n.timestamp);
        if (t >= since && t <= until) all.push(n);
      }
    } catch {}
  }

  return all.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/**
 * Delete all notes for a specific day (YYYY-MM-DD).
 */
export function clearNotes({ dayISO }) {
  ensureNotesDir();
  const file = notesPath(dayISO);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
