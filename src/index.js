// src/index.js
import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder } from "discord.js";
import { CronJob } from "cron";

import { summarizeMessages } from "./summarizer.js";
import { ensureDirs, appendMessage, loadWindow } from "./storage.js";
import { redact, shouldSkip } from "./redact.js";
import { windowHoursEnd } from "./utils/time.js";
import { ensureNotesDir, addNote, getNotesBetween } from "./notes.js";
import { getHappenings } from "./happenings.js";
import { startServer } from "./server.js";

// ──────────────────────────────────────────────────────────────
// Core config
// ──────────────────────────────────────────────────────────────
const tz = process.env.TIMEZONE || "Asia/Dhaka";
const allowed = new Set(
  (process.env.DISCORD_ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);
const maxContext = parseInt(process.env.MAX_CONTEXT_MESSAGES || "500", 10);

// ──────────────────────────────────────────────────────────────
/** Lightweight telemetry for the dashboard */
// ──────────────────────────────────────────────────────────────
const statusState = {
  startedAt: Date.now(),
  lastDigestAt: null,
  errors: [],
  botTag: null,
  ready: false,
};
function logError(context, err) {
  const msg = `${context}: ${err?.message || String(err)}`;
  statusState.errors.push(msg);
  if (statusState.errors.length > 200) statusState.errors = statusState.errors.slice(-200);
  console.error(msg);
}

// ──────────────────────────────────────────────────────────────
// Autosummary knobs
// ──────────────────────────────────────────────────────────────
const autosummaryEnabled = String(process.env.AUTOSUMMARY_ENABLED || "false").toLowerCase() === "true";
const autosummaryCron = process.env.AUTOSUMMARY_INTERVAL_CRON || "*/30 * * * *";
const autosummaryMin = parseInt(process.env.AUTOSUMMARY_MIN_MESSAGES || "25", 10);
const autosummaryTarget = process.env.AUTOSUMMARY_TARGET_CHANNEL_ID || null;
const autosummaryLookbackHrs = parseInt(process.env.AUTOSUMMARY_LOOKBACK_HOURS || "6", 10);

// ──────────────────────────────────────────────────────────────
// Bootstrapping
// ──────────────────────────────────────────────────────────────
ensureDirs();
ensureNotesDir();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once("ready", async () => {
  statusState.ready = true;
  statusState.botTag = client.user.tag;
  console.log(`🤖 Logged in as ${client.user.tag}`);
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const perms = parseInt(process.env.INVITE_PERMISSIONS || "84992", 10);
    if (clientId) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=bot%20applications.commands`;
      console.log(`🔗 Bot OAuth Invite URL: ${url}`);
    }
  } catch (err) {
    logError("ready", err);
  }
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function fmt(dt) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(dt instanceof Date ? dt : new Date(dt));
  } catch {
    return String(dt);
  }
}

function buildFooter({ channelName, count, start, end }) {
  return `\n\n— _Summary based on ${count} messages from #${channelName} between ${fmt(start)} and ${fmt(end)} ${tz}_`;
}

// Split text into <=2000 char chunks for Discord
function splitIntoDiscordChunks(text, limit = 2000) {
  const s = String(text || "");
  if (s.length <= limit) return [s];
  const chunks = [];
  const separators = ["\n\n---\n\n", "\n\n", "\n", " "];
  let remaining = s;
  while (remaining.length > limit) {
    let cut = -1;
    for (const sep of separators) {
      const idx = remaining.lastIndexOf(sep, limit);
      if (idx > 0) { cut = idx + sep.length; break; }
    }
    if (cut === -1) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function sendLong(channel, content) {
  const parts = splitIntoDiscordChunks(content);
  for (const p of parts) {
    if (p && p.trim().length) {
      // eslint-disable-next-line no-await-in-loop
      await channel.send({ content: p });
    }
  }
}

async function deliverInteractionText(interaction, content) {
  const parts = splitIntoDiscordChunks(content);
  if (parts.length === 1) return interaction.editReply({ content: parts[0] });
  await interaction.editReply({ content: parts[0] });
  for (let i = 1; i < parts.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await interaction.followUp({ content: parts[i] });
  }
}

function renderHappenings({ sinceISO, untilISO }) {
  const sectionName = process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings";
  const rows = getHappenings({ sinceISO, untilISO });
  if (!rows.length) return "";
  const lines = rows.map(h => `- ${h.text}  _(by ${h.author} • ${new Date(h.at).toLocaleString("en-GB", { hour12:false, timeZone: tz })})_`);
  return `\n\n**${sectionName} (from Chat)**\n${lines.join("\n")}`;
}

// Backfill helper to fetch recent messages if logs are empty
async function backfillChannelMessages(channelId, sinceISO, limit = 100) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return [];
    const sinceMs = Date.parse(sinceISO);
    const maxFetch = Math.min(Math.max(1, limit), 500);
    const collected = [];
    let before;
    while (collected.length < maxFetch) {
      const remaining = Math.min(100, maxFetch - collected.length);
      const page = await channel.messages.fetch({ limit: remaining, before });
      if (!page.size) break;
      const batch = Array.from(page.values())
        .filter(m => !m.author.bot)
        .filter(m => m.createdTimestamp >= sinceMs)
        .map(m => ({
          id: m.id,
          author: m.member?.nickname || m.author.username,
          authorId: m.author.id,
          timestamp: new Date(m.createdTimestamp).toISOString(),
          text: redact(m.content || "")
        }));
      const oldest = page.last();
      if (oldest && oldest.createdTimestamp < sinceMs && batch.length === 0) break;
      for (const msg of batch.sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
        appendMessage({ channelId, message: msg });
        collected.push(msg);
      }
      before = oldest?.id;
      if (!before) break;
    }
    return collected;
  } catch (e) {
    logError(`backfill:${channelId}`, e);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Summary builders
// ──────────────────────────────────────────────────────────────
async function summarizeChannel(chId, hoursDefault) {
  const hours = hoursDefault;
  const { start, end } = windowHoursEnd(tz, hours);
  let msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: end.toISO() });
  if (msgs.length === 0) {
    await backfillChannelMessages(chId, start.toISO(), 200);
    msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: end.toISO() });
  }
  if (!msgs.length) return null;

  const slice = msgs.slice(-maxContext);
  const out = await summarizeMessages({ messages: slice, model: process.env.OPENAI_MODEL, hours, tz });
  const ch = await client.channels.fetch(chId).catch(() => null);
  const footer = buildFooter({ channelName: ch?.name || chId, count: slice.length, start, end });

  // Channel-specific notes (if any)
  const notes = getNotesBetween({ sinceISO: start.toISO(), untilISO: end.toISO() }).filter(n => n.channelId === chId);
  let notesSection = "";
  if (notes.length) {
    const grouped = notes.reduce((acc, n) => {
      acc[n.section] = acc[n.section] || [];
      acc[n.section].push(n);
      return acc;
    }, {});
    const parts = [];
    for (const [section, arr] of Object.entries(grouped)) {
      const lines = arr.map(n => `- [${fmt(n.timestamp)}] ${n.author}: ${n.text}`);
      parts.push(`**${section}**\n${lines.join("\n")}`);
    }
    notesSection = `\n\n${parts.join("\n\n")}`;
  }

  // Global “Key Happenings”
  const happeningsBlock = renderHappenings({ sinceISO: start.toISO(), untilISO: end.toISO() });

  const isOutEmpty = out === "No Discord activity found in the selected window.";


  const finalOutput = isOutEmpty ? '' : out + footer;

  return { title: `#${ch?.name || chId}`, content: finalOutput + notesSection + happeningsBlock };
}

// Multi-channel digest (cron/webhook)
async function runDigestOnce() {
  try {
    const digestId = process.env.DISCORD_SUMMARY_CHANNEL_ID;
    if (!digestId) return;
    const digestChannel = await client.channels.fetch(digestId).catch(() => null);
    if (!digestChannel) return;

    const hours = parseInt(process.env.SUMMARY_HOURS_DEFAULT || "24", 10);
    const { start, end } = windowHoursEnd(tz, hours);

    const sections = [];
    for (const chId of Array.from(allowed)) {
      const result = await summarizeChannel(chId, hours);
      if (!result || /^\s*$/.test(result.content)) continue;
      sections.push(`**${result.title}**\n${result.content}`);
    }

    const universeHappenings = renderHappenings({ sinceISO: start.toISO(), untilISO: end.toISO() });

    if (!sections.length && !universeHappenings) return;
    const header = `**Universe Daily Digest** (last ${hours}h) – ${fmt(new Date())} ${tz}`;
    const finalContent = [header, ...sections, universeHappenings].filter(Boolean).join("\n\n--- \n\n");
    await sendLong(digestChannel, finalContent);

    statusState.lastDigestAt = Date.now();
  } catch (err) {
    logError("runDigestOnce", err);
  }
}

// ──────────────────────────────────────────────────────────────
// Events
// ──────────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.channel.type !== ChannelType.GuildText) return;

    const chId = message.channel.id;
    if (!allowed.has(chId)) return; // privacy gate

    const text = message.content?.trim();
    if (!text) return;
    if (shouldSkip(text)) return;

    const clean = redact(text);
    appendMessage({
      channelId: chId,
      message: {
        id: message.id,
        author: message.member?.nickname || message.author.username,
        authorId: message.author.id,
        timestamp: message.createdAt.toISOString(),
        text: clean
      }
    });

    // Inline notes (optional): 📝 or [note] prefix
    if (/^(\s*📝|\s*\[note\])/i.test(text)) {
      const noteText = clean.replace(/^(\s*📝|\s*\[note\])\s*/i, "");
      await addNote({
        timestampISO: message.createdAt.toISOString(),
        author: message.member?.nickname || message.author.username,
        authorId: message.author.id,
        channelId: chId,
        section: "Manual Notes",
        text: noteText
      });
    }
  } catch (err) {
    logError("messageCreate", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;
  const chId = interaction.channelId;

  if (!allowed.has(chId)) {
    return interaction.reply({ ephemeral: true, content: "This channel is not allowlisted." });
  }

  const hoursDefault = parseInt(process.env.SUMMARY_HOURS_DEFAULT || "24", 10);
  const channel = await interaction.client.channels.fetch(chId);

  if (name === "summary" || name === "daily" || name === "report") {
    const hours = name === "summary"
      ? (interaction.options.getInteger("hours") || hoursDefault)
      : hoursDefault;

    await interaction.deferReply({ ephemeral: false });

    const result = await summarizeChannel(chId, hours);
    if (!result) return interaction.editReply({ content: "No Discord activity found in the selected window." });

    if (name === "report") {
      const desc = result.content;
      if (desc.length <= 3900) {
        const embed = new EmbedBuilder()
          .setTitle("Purrfect Universe – Channel Report")
          .setDescription(desc)
          .setTimestamp(new Date());
        return interaction.editReply({ embeds: [embed] });
      }
      return deliverInteractionText(interaction, `**Purrfect Universe – Channel Report**\n\n${desc}`);
    }

    return deliverInteractionText(interaction, result.content);
  }

  if (name === "backfill") {
    const hours = interaction.options.getInteger("hours") || hoursDefault;
    const limit = interaction.options.getInteger("limit") || 200;
    await interaction.deferReply({ ephemeral: true });
    const { start } = windowHoursEnd(tz, hours);
    const fetched = await backfillChannelMessages(chId, start.toISO(), limit);
    return interaction.editReply(`Backfill complete: stored ${fetched.length} messages from #${channel.name} (last ${hours}h).`);
  }
});

// ──────────────────────────────────────────────────────────────
// Schedulers
// ──────────────────────────────────────────────────────────────
const cronExpr = process.env.DAILY_SUMMARY_CRON || "0 21 * * *";
const dailyJob = new CronJob(cronExpr, runDigestOnce, null, true, tz);
dailyJob.start();

if (autosummaryEnabled) {
  const autoJob = new CronJob(autosummaryCron, async () => {
    try {
      const hours = autosummaryLookbackHrs;
      const { start } = windowHoursEnd(tz, hours);

      for (const chId of Array.from(allowed)) {
        let msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: new Date().toISOString() });
        if (msgs.length === 0) {
          await backfillChannelMessages(chId, start.toISO(), 200);
          msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: new Date().toISOString() });
        }
        if (msgs.length < autosummaryMin) continue;

        const result = await summarizeChannel(chId, hours);
        if (!result || /^\s*$/.test(result.content)) continue;

        const targetId = autosummaryTarget || chId;
        const targetChannel = await client.channels.fetch(targetId).catch(() => null);
        if (!targetChannel) continue;

        const header = `**Auto-summary** (last ${hours}h due to high activity – ${msgs.length} msgs)`;
        await sendLong(targetChannel, `${header}\n\n${result.content}`);
      }
    } catch (err) {
      logError("autosummary", err);
    }
  }, null, true, tz);
  console.log(`⚡ Auto-summary enabled: cron="${autosummaryCron}", min=${autosummaryMin}, lookback=${autosummaryLookbackHrs}h`);
}

// ──────────────────────────────────────────────────────────────
/** Unified single-port server (dashboard + webhooks) */
// ──────────────────────────────────────────────────────────────
startServer({
  port: parseInt(process.env.SERVER_PORT || process.env.STATUS_PORT || "3000", 10),
  host: process.env.SERVER_HOST || "127.0.0.1",
  canonicalBaseUrl: process.env.CANONICAL_BASE_URL || "",
  secret: process.env.UNIVERSE_WEBHOOK_SECRET,
  // Forms & API -> notes/happenings
  onNote: async (n) => addNote(n),
  // Some server implementations also support onHappening; pass-through if supported
  onHappening: async (h) => {
    // optional: you may store "happenings" differently; many teams map them to notes with a dedicated section
    await addNote({
      timestampISO: h.timestampISO || new Date().toISOString(),
      author: h.author || "Dashboard",
      authorId: h.authorId || "dashboard",
      channelId: h.channelId || process.env.DISCORD_SUMMARY_CHANNEL_ID || null,
      section: h.section || (process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings"),
      text: h.text || ""
    });
  },
  onDigest: async () => runDigestOnce(),
  isAllowedChannel: (id) => allowed.has(id),
  defaultChannelId: process.env.DISCORD_SUMMARY_CHANNEL_ID,
  getState: async () => {
    const now = Date.now();
    const { start: s24, end: e24 } = windowHoursEnd(tz, 24);
    const { start: s7d, end: e7d } = windowHoursEnd(tz, 24 * 7);
    const channels = [];

    for (const chId of Array.from(allowed)) {
      let name = chId;
      try {
        const ch = await client.channels.fetch(chId);
        name = ch?.name || chId;
      } catch {}
      const c24 = loadWindow({ channelId: chId, sinceISO: s24.toISO(), untilISO: e24.toISO() }).length;
      const c7d = loadWindow({ channelId: chId, sinceISO: s7d.toISO(), untilISO: e7d.toISO() }).length;
      channels.push({ id: chId, name, count24h: c24, count7d: c7d });
    }

    return {
      tz,
      ready: statusState.ready,
      botTag: statusState.botTag,
      uptimeMs: now - statusState.startedAt,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      dailyCron: process.env.DAILY_SUMMARY_CRON || "0 21 * * *",
      lastDigestAt: statusState.lastDigestAt,
      autosummary: {
        enabled: autosummaryEnabled,
        cron: autosummaryCron,
        min: autosummaryMin,
        lookback: autosummaryLookbackHrs
      },
      channels,
      errors: statusState.errors.slice(-50)
    };
  }
});

// ──────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
