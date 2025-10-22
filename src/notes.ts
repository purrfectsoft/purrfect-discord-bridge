import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NoteInput, NoteRecord } from "./types.js";
import { redact } from "./redact.js";

const dataDir = process.env.DATA_DIR || "./data";
const notesDir = path.join(dataDir, "notes");

export function ensureNotesDir(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(notesDir)) mkdirSync(notesDir, { recursive: true });
}

function notesPath(dayISO: string): string {
  return path.join(notesDir, `${dayISO}.json`);
}

export function addNote({
  timestampISO,
  author,
  authorId,
  channelId,
  section = "Manual Notes",
  text,
}: NoteInput): void {
  ensureNotesDir();
  const safeText = redact(String(text || "").trim());
  if (!safeText) return;

  const ts = timestampISO || new Date().toISOString();
  const dayISO = ts.slice(0, 10);
  const file = notesPath(dayISO);

  let arr: NoteRecord[] = [];
  if (existsSync(file)) {
    try {
      arr = JSON.parse(readFileSync(file, "utf8")) as NoteRecord[];
    } catch {
      arr = [];
    }
  }

  arr.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: ts,
    author: author || "Unknown",
    authorId: authorId || "unknown",
    channelId: channelId ?? null,
    section,
    text: safeText,
  });

  writeFileSync(file, JSON.stringify(arr, null, 2));
}

export function getNotesBetween({ sinceISO, untilISO }: { sinceISO: string; untilISO: string }): NoteRecord[] {
  ensureNotesDir();
  const since = new Date(sinceISO);
  const until = new Date(untilISO);

  const days: string[] = [];
  for (
    let d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
    d <= until;
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }

  const all: NoteRecord[] = [];
  for (const day of days) {
    const file = notesPath(day);
    if (!existsSync(file)) continue;
    try {
      const arr = JSON.parse(readFileSync(file, "utf8")) as NoteRecord[];
      for (const n of arr) {
        const t = new Date(n.timestamp);
        if (t >= since && t <= until) {
          all.push(n);
        }
      }
    } catch {
      // ignore malformed files
    }
  }

  return all.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function clearNotes({ dayISO }: { dayISO: string }): void {
  ensureNotesDir();
  const file = notesPath(dayISO);
  if (existsSync(file)) unlinkSync(file);
}
