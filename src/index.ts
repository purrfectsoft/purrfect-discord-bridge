import dotenv from "dotenv";

dotenv.config();

import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  TextBasedChannel,
  TextChannel,
} from "discord.js";
import { CronJob } from "cron";

import { summarizeMessages } from "./summarizer.js";
import { appendMessage, ensureDirs, loadWindow } from "./storage.js";
import { redact, shouldSkip } from "./redact.js";
import { windowHoursEnd } from "./utils/time.js";
import { addNote, ensureNotesDir, getNotesBetween } from "./notes.js";
import { getHappenings } from "./happenings.js";
import { startServer } from "./server.js";
import type { LoggedMessage, NoteRecord, SummaryResult } from "./types.js";

const tz = process.env.TIMEZONE || "Asia/Dhaka";
const allowed = new Set(
  (process.env.DISCORD_ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const maxContext = Number.parseInt(process.env.MAX_CONTEXT_MESSAGES || "500", 10);

interface StatusState {
  startedAt: number;
  lastDigestAt: number | null;
  errors: string[];
  botTag: string | null;
  ready: boolean;
}

const statusState: StatusState = {
  startedAt: Date.now(),
  lastDigestAt: null,
  errors: [],
  botTag: null,
  ready: false,
};

function logError(context: string, error: unknown): void {
  const message = `${context}: ${(error as Error)?.message || String(error)}`;
  statusState.errors.push(message);
  if (statusState.errors.length > 200) {
    statusState.errors = statusState.errors.slice(-200);
  }
  console.error(message);
}

const autosummaryEnabled = String(process.env.AUTOSUMMARY_ENABLED || "false").toLowerCase() === "true";
const autosummaryCron = process.env.AUTOSUMMARY_INTERVAL_CRON || "*/30 * * * *";
const autosummaryMin = Number.parseInt(process.env.AUTOSUMMARY_MIN_MESSAGES || "25", 10);
const autosummaryTarget = process.env.AUTOSUMMARY_TARGET_CHANNEL_ID || null;
const autosummaryLookbackHrs = Number.parseInt(process.env.AUTOSUMMARY_LOOKBACK_HOURS || "6", 10);

ensureDirs();
ensureNotesDir();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.once("ready", async () => {
  statusState.ready = true;
  statusState.botTag = client.user?.tag ?? null;
  console.log(`🤖 Logged in as ${client.user?.tag ?? "unknown"}`);
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const perms = Number.parseInt(process.env.INVITE_PERMISSIONS || "84992", 10);
    if (clientId) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=bot%20applications.commands`;
      console.log(`🔗 Bot OAuth Invite URL: ${url}`);
    }
  } catch (error) {
    logError("ready", error);
  }
});

function fmt(dt: Date | string | number): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt instanceof Date ? dt : new Date(dt));
  } catch {
    return String(dt);
  }
}

function buildFooter({
  channelName,
  count,
  startISO,
  endISO,
}: {
  channelName: string;
  count: number;
  startISO: string;
  endISO: string;
}): string {
  return `\n\n— _Summary based on ${count} messages from #${channelName} between ${fmt(startISO)} and ${fmt(endISO)} ${tz}_`;
}

function splitIntoDiscordChunks(text: string, limit = 2000): string[] {
  const s = String(text || "");
  if (s.length <= limit) return [s];
  const chunks: string[] = [];
  const separators = ["\n\n---\n\n", "\n\n", "\n", " "];
  let remaining = s;
  while (remaining.length > limit) {
    let cut = -1;
    for (const sep of separators) {
      const idx = remaining.lastIndexOf(sep, limit);
      if (idx > 0) {
        cut = idx + sep.length;
        break;
      }
    }
    if (cut === -1) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function sendLong(channel: TextBasedChannel, content: string): Promise<void> {
  const parts = splitIntoDiscordChunks(content);
  for (const part of parts) {
    if (!part.trim()) continue;
    await channel.send({ content: part });
  }
}

async function deliverInteractionText(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  const parts = splitIntoDiscordChunks(content);
  if (parts.length === 1) {
    await interaction.editReply({ content: parts[0] });
    return;
  }
  await interaction.editReply({ content: parts[0] });
  for (let i = 1; i < parts.length; i += 1) {
    await interaction.followUp({ content: parts[i] });
  }
}

function renderHappenings({ sinceISO, untilISO }: { sinceISO: string; untilISO: string }): string {
  const sectionName = process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings";
  const rows = getHappenings({ sinceISO, untilISO });
  if (!rows.length) return "";
  const lines = rows.map(
    (h) =>
      `- ${h.text}  _(by ${h.author} • ${new Date(h.at).toLocaleString("en-GB", { hour12: false, timeZone: tz })})_`,
  );
  return `\n\n**${sectionName} (from Chat)**\n${lines.join("\n")}`;
}

async function fetchTextChannel(channelId: string): Promise<TextChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return null;
    return channel as TextChannel;
  } catch (error) {
    logError(`fetchChannel:${channelId}`, error);
    return null;
  }
}

async function backfillChannelMessages(channelId: string, sinceISO: string, limit = 100): Promise<LoggedMessage[]> {
  try {
    const channel = await fetchTextChannel(channelId);
    if (!channel) return [];
    const sinceMs = Date.parse(sinceISO);
    const maxFetch = Math.min(Math.max(1, limit), 500);
    const collected: LoggedMessage[] = [];
    let before: string | undefined;
    while (collected.length < maxFetch) {
      const remaining = Math.min(100, maxFetch - collected.length);
      const page = await channel.messages.fetch({ limit: remaining, before });
      if (!page.size) break;
      const batch = Array.from(page.values())
        .filter((m) => !m.author.bot)
        .filter((m) => m.createdTimestamp >= sinceMs)
        .map<LoggedMessage>((m) => ({
          id: m.id,
          author: m.member?.nickname || m.author.username,
          authorId: m.author.id,
          timestamp: new Date(m.createdTimestamp).toISOString(),
          text: redact(m.content || ""),
        }));
      const oldest = page.last();
      if (oldest && oldest.createdTimestamp < sinceMs && batch.length === 0) break;
      for (const msg of batch.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
        appendMessage({ channelId, message: msg });
        collected.push(msg);
      }
      before = oldest?.id;
      if (!before) break;
    }
    return collected;
  } catch (error) {
    logError(`backfill:${channelId}`, error);
    return [];
  }
}

async function summarizeChannel(chId: string, hours: number): Promise<SummaryResult | null> {
  const { start, end } = windowHoursEnd(tz, hours);
  let msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: end.toISO() });
  if (msgs.length === 0) {
    await backfillChannelMessages(chId, start.toISO(), 200);
    msgs = loadWindow({ channelId: chId, sinceISO: start.toISO(), untilISO: end.toISO() });
  }
  if (!msgs.length) return null;

  const slice = msgs.slice(-maxContext);
  const summary = await summarizeMessages({ messages: slice, model: process.env.OPENAI_MODEL, hours, tz });
  const channel = await fetchTextChannel(chId);
  const startISO = start.toISO();
  const endISO = end.toISO();
  const footer = buildFooter({ channelName: channel?.name || chId, count: slice.length, startISO, endISO });

  const notes = getNotesBetween({ sinceISO: startISO, untilISO: endISO }).filter((n) => n.channelId === chId);
  let notesSection = "";
  if (notes.length) {
    const grouped = notes.reduce<Record<string, NoteRecord[]>>((acc, note) => {
      const section = note.section;
      if (!acc[section]) acc[section] = [];
      acc[section]!.push(note);
      return acc;
    }, {});
    const parts: string[] = [];
    for (const [section, arr] of Object.entries(grouped)) {
      const lines = arr.map((n) => `- [${fmt(n.timestamp)}] ${n.author}: ${n.text}`);
      parts.push(`**${section}**\n${lines.join("\n")}`);
    }
    notesSection = `\n\n${parts.join("\n\n")}`;
  }

  const happeningsBlock = renderHappenings({ sinceISO: start.toISO(), untilISO: end.toISO() });

  return { title: `#${channel?.name || chId}`, content: summary + footer + notesSection + happeningsBlock };
}

async function runDigestOnce(): Promise<void> {
  try {
    const digestId = process.env.DISCORD_SUMMARY_CHANNEL_ID;
    if (!digestId) return;
    const digestChannel = await fetchTextChannel(digestId);
    if (!digestChannel) return;

    const hours = Number.parseInt(process.env.SUMMARY_HOURS_DEFAULT || "24", 10);
    const { start, end } = windowHoursEnd(tz, hours);

    const sections: string[] = [];
    for (const chId of Array.from(allowed)) {
      const result = await summarizeChannel(chId, hours);
      if (!result) continue;
      sections.push(`**${result.title}**\n${result.content}`);
    }

    const universeHappenings = renderHappenings({ sinceISO: start.toISO(), untilISO: end.toISO() });

    if (!sections.length && !universeHappenings) return;
    const header = `**Universe Daily Digest** (last ${hours}h) – ${fmt(new Date())} ${tz}`;
    const finalContent = [header, ...sections, universeHappenings].filter(Boolean).join("\n\n--- \n\n");
    await sendLong(digestChannel, finalContent);

    statusState.lastDigestAt = Date.now();
  } catch (error) {
    logError("runDigestOnce", error);
  }
}

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.channel.type !== ChannelType.GuildText) return;

    const chId = message.channel.id;
    if (!allowed.has(chId)) return;

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
        text: clean,
      },
    });

    if (/^(\s*📝|\s*\[note\])/iu.test(text)) {
      const noteText = clean.replace(/^(\s*📝|\s*\[note\])\s*/iu, "");
      await addNote({
        timestampISO: message.createdAt.toISOString(),
        author: message.member?.nickname || message.author.username,
        authorId: message.author.id,
        channelId: chId,
        section: "Manual Notes",
        text: noteText,
      });
    }
  } catch (error) {
    logError("messageCreate", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;
  const chId = interaction.channelId;

  if (!allowed.has(chId)) {
    await interaction.reply({ ephemeral: true, content: "This channel is not allowlisted." });
    return;
  }

  const hoursDefault = Number.parseInt(process.env.SUMMARY_HOURS_DEFAULT || "24", 10);
  const channel = await interaction.client.channels.fetch(chId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ ephemeral: true, content: "This command only works in guild text channels." });
    return;
  }

  if (name === "summary" || name === "daily" || name === "report") {
    const hours =
      name === "summary" ? interaction.options.getInteger("hours") || hoursDefault : hoursDefault;

    await interaction.deferReply({ ephemeral: false });

    const result = await summarizeChannel(chId, hours);
    if (!result) {
      await interaction.editReply({ content: "No Discord activity found in the selected window." });
      return;
    }

    if (name === "report") {
      const desc = result.content;
      if (desc.length <= 3900) {
        const embed = new EmbedBuilder()
          .setTitle("Purrfect Universe – Channel Report")
          .setDescription(desc)
          .setTimestamp(new Date());
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      await deliverInteractionText(interaction, `**Purrfect Universe – Channel Report**\n\n${desc}`);
      return;
    }

    await deliverInteractionText(interaction, result.content);
    return;
  }

  if (name === "backfill") {
    const hours = interaction.options.getInteger("hours") || hoursDefault;
    const limit = interaction.options.getInteger("limit") || 200;
    await interaction.deferReply({ ephemeral: true });
    const { start } = windowHoursEnd(tz, hours);
    const fetched = await backfillChannelMessages(chId, start.toISO(), limit);
    await interaction.editReply(`Backfill complete: stored ${fetched.length} messages from #${channel.name} (last ${hours}h).`);
  }
});

const cronExpr = process.env.DAILY_SUMMARY_CRON || "0 21 * * *";
const dailyJob = new CronJob(cronExpr, runDigestOnce, null, true, tz);
dailyJob.start();

if (autosummaryEnabled) {
  new CronJob(
    autosummaryCron,
    async () => {
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
          if (!result) continue;

          const targetId = autosummaryTarget || chId;
          const targetChannel = await fetchTextChannel(targetId);
          if (!targetChannel) continue;

          const header = `**Auto-summary** (last ${hours}h due to high activity – ${msgs.length} msgs)`;
          await sendLong(targetChannel, `${header}\n\n${result.content}`);
        }
      } catch (error) {
        logError("autosummary", error);
      }
    },
    null,
    true,
    tz,
  );
  console.log(
    `⚡ Auto-summary enabled: cron="${autosummaryCron}", min=${autosummaryMin}, lookback=${autosummaryLookbackHrs}h`,
  );
}

startServer({
  port: Number.parseInt(process.env.SERVER_PORT || process.env.STATUS_PORT || "3000", 10),
  host: process.env.SERVER_HOST || "127.0.0.1",
  canonicalBaseUrl: process.env.CANONICAL_BASE_URL || "",
  secret: process.env.UNIVERSE_WEBHOOK_SECRET,
  onNote: async (note) => {
    await addNote(note);
  },
  onHappening: async (happening) => {
    await addNote({
      timestampISO: happening.timestampISO || new Date().toISOString(),
      author: happening.author || "Dashboard",
      authorId: happening.authorId || "dashboard",
      channelId: happening.channelId || process.env.DISCORD_SUMMARY_CHANNEL_ID || null,
      section: happening.section || process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings",
      text: happening.text || "",
    });
  },
  onDigest: runDigestOnce,
  isAllowedChannel: (id) => allowed.has(id),
  defaultChannelId: process.env.DISCORD_SUMMARY_CHANNEL_ID,
  getState: async () => {
    const now = Date.now();
    const { start: s24, end: e24 } = windowHoursEnd(tz, 24);
    const { start: s7d, end: e7d } = windowHoursEnd(tz, 24 * 7);
    const channels: Array<{ id: string; name: string; count24h: number; count7d: number }> = [];

    for (const chId of Array.from(allowed)) {
      let name = chId;
      try {
        const channel = await fetchTextChannel(chId);
        name = channel?.name || chId;
      } catch {
        name = chId;
      }
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
        lookback: autosummaryLookbackHrs,
      },
      channels,
      errors: statusState.errors.slice(-50),
    };
  },
});

void client.login(process.env.DISCORD_TOKEN);
