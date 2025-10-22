import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { HappeningInput, HappeningRecord } from "./types.js";
import { redact } from "./redact.js";

const dataDir = process.env.DATA_DIR || "./data";
const filePath = path.join(dataDir, "keyhappenings.json");

function ensureFile(): void {
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	if (!existsSync(filePath)) writeFileSync(filePath, "[]");
}

export function addHappening({
	text,
	author = "Chat",
	source = "chatgpt",
	channelId = null,
	section,
	timestampISO,
}: HappeningInput): void {
	ensureFile();
	const clean = redact(String(text || "").trim()).slice(0, 2000);
	if (!clean) return;

	const payload: HappeningRecord = {
		id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
		at: timestampISO || new Date().toISOString(),
		text: clean,
		author: String(author || "Chat"),
		source: String(source || "chatgpt"),
		channelId: channelId ?? null,
		section:
			section || process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings",
	};

	const arr = JSON.parse(readFileSync(filePath, "utf8")) as HappeningRecord[];
	arr.push(payload);
	writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

export function getHappenings({
	sinceISO,
	untilISO,
}: { sinceISO: string; untilISO: string }): HappeningRecord[] {
	ensureFile();
	const since = new Date(sinceISO);
	const until = new Date(untilISO);
	const arr = JSON.parse(readFileSync(filePath, "utf8")) as HappeningRecord[];
	return arr
		.filter((h) => {
			const t = new Date(h.at);
			return t >= since && t <= until;
		})
		.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
