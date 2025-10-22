import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";

import type { LoggedMessage } from "./types.js";

const dataDir = process.env.DATA_DIR || "./data";
const logsDir = path.join(dataDir, "logs");

export function ensureDirs(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
}

function logPath(channelId: string, dayISO: string): string {
  return path.join(logsDir, `${channelId}_${dayISO}.json`);
}

export function appendMessage({ channelId, message }: { channelId: string; message: LoggedMessage }): void {
  const day = DateTime.fromISO(message.timestamp).toISODate();
  const file = logPath(channelId, day);
  let arr: LoggedMessage[] = [];
  if (existsSync(file)) {
    try {
      arr = JSON.parse(readFileSync(file, "utf8")) as LoggedMessage[];
    } catch {
      arr = [];
    }
  }
  arr.push(message);
  writeFileSync(file, JSON.stringify(arr, null, 2));
}

export function loadWindow({
  channelId,
  sinceISO,
  untilISO,
}: {
  channelId: string;
  sinceISO: string;
  untilISO: string;
}): LoggedMessage[] {
  const since = DateTime.fromISO(sinceISO);
  const until = DateTime.fromISO(untilISO);
  const days: string[] = [];
  for (let d = since.startOf("day"); d <= until.startOf("day"); d = d.plus({ days: 1 })) {
    days.push(d.toISODate());
  }
  const all: LoggedMessage[] = [];
  for (const day of days) {
    const file = logPath(channelId, day);
    if (!existsSync(file)) continue;
    try {
      const arr = JSON.parse(readFileSync(file, "utf8")) as LoggedMessage[];
      for (const m of arr) {
        const ts = DateTime.fromISO(m.timestamp);
        if (ts >= since && ts <= until) {
          all.push(m);
        }
      }
    } catch {
      // ignore corrupt files
    }
  }
  return all.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
