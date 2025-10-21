import fs from "fs";
import path from "path";
import { DateTime } from "luxon";


const dataDir = process.env.DATA_DIR || "./data";
const logsDir = path.join(dataDir, "logs");


export function ensureDirs() {
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
}


function logPath(channelId, dayISO) {
return path.join(logsDir, `${channelId}_${dayISO}.json`);
}


export function appendMessage({ channelId, message }) {
const day = DateTime.fromISO(message.timestamp).toISODate();
const file = logPath(channelId, day);
let arr = [];
if (fs.existsSync(file)) {
try { arr = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
}
arr.push(message);
fs.writeFileSync(file, JSON.stringify(arr, null, 2));
}


export function loadWindow({ channelId, sinceISO, untilISO }) {
const since = DateTime.fromISO(sinceISO);
const until = DateTime.fromISO(untilISO);
const days = [];
for (let d = since.startOf("day"); d <= until.startOf("day"); d = d.plus({ days: 1 })) {
days.push(d.toISODate());
}
const all = [];
for (const day of days) {
const file = logPath(channelId, day);
if (!fs.existsSync(file)) continue;
try {
const arr = JSON.parse(fs.readFileSync(file, "utf8"));
for (const m of arr) {
const ts = DateTime.fromISO(m.timestamp);
if (ts >= since && ts <= until) all.push(m);
}
} catch {}
}
return all;
}
