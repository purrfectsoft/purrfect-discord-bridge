// src/happenings.js
import fs from "fs";
import path from "path";
import { redact } from "./redact.js";

const dataDir = process.env.DATA_DIR || "./data";
const filePath = path.join(dataDir, "keyhappenings.json");

function ensureFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]");
}

/**
 * Store a short, sanitized "Key Happening" item.
 */
export function addHappening({
  text,
  author = "Chat",
  source = "chatgpt",
  channelId = null,
  section
}) {
  ensureFile();
  const clean = redact(String(text || "").trim()).slice(0, 2000);
  if (!clean) return;

  const payload = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    text: clean,
    author: String(author || "Chat"),
    source: String(source || "chatgpt"),
    channelId: channelId || null,
    section: section || (process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings"),
  };

  const arr = JSON.parse(fs.readFileSync(filePath, "utf8"));
  arr.push(payload);
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

/**
 * Retrieve happenings within a time window (inclusive), sorted by time.
 */
export function getHappenings({ sinceISO, untilISO }) {
  ensureFile();
  const since = new Date(sinceISO);
  const until = new Date(untilISO);
  const arr = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return arr
    .filter((h) => {
      const t = new Date(h.at);
      return t >= since && t <= until;
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}
