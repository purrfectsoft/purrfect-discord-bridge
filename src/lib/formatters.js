// src/lib/formatters.js
import { EmbedBuilder } from "discord.js";

function formatDate(iso) {
  if (!iso) return "unknown";
  try { return new Date(iso).toLocaleString("en-GB", { hour12: false }); }
  catch { return iso; }
}
function formatNumber(num) {
  if (num === null || num === undefined) return "unknown";
  return new Intl.NumberFormat("en-GB").format(num);
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toMarkdownMap(guild, tree) {
  const { guildMeta, categories, emojiMap, truncated } = tree;
  const headerLines = [
    `# Server map – ${guildMeta.name} (${guildMeta.id})`,
    `Created: ${formatDate(guildMeta.createdAt)}`,
    `Members: ${formatNumber(guildMeta.memberCount)} | Roles: ${formatNumber(guildMeta.roleCount)}`,
    ""
  ];
  const lines = [...headerLines];

  for (const category of categories) {
    lines.push(`- **${category.name}** (${category.id})`);
    for (const channel of category.channels) {
      const emoji = emojiMap[channel.type] || "#";
      const priv = channel.private ? " 🔒" : "";
      lines.push(`  - ${emoji} ${channel.name}${priv} (ID: ${channel.id})`);
      for (const perm of channel.permissionSummary) {
        lines.push(`    - ${perm}`);
      }
      for (const thread of channel.threads) {
        const threadPriv = thread.private ? " 🔒" : "";
        lines.push(`    - ${emojiMap.thread} ${thread.name}${threadPriv} (ID: ${thread.id})`);
        for (const perm of thread.permissionSummary) {
          lines.push(`      - ${perm}`);
        }
      }
    }
  }

  if (truncated) {
    lines.push("", "_Note: Channel list truncated by max_channels option._");
  }

  return lines.join("\n");
}

export function toJsonMap(tree) {
  return JSON.stringify({
    guild: tree.guildMeta,
    categories: tree.categories,
    truncated: tree.truncated
  }, null, 2);
}

export function toCsvMap(tree) {
  const rows = [["level", "type", "category", "channel", "thread", "id", "private", "readable_by", "postable_by"]];

  for (const category of tree.categories) {
    rows.push(["category", "category", category.name, "", "", category.id, "", "", ""]);
    for (const channel of category.channels) {
      rows.push([
        "channel",
        channel.type,
        category.name,
        channel.name,
        "",
        channel.id,
        channel.private ? "yes" : "no",
        channel.readableBy.join("; "),
        channel.postableBy.join("; ")
      ]);
      for (const thread of channel.threads) {
        rows.push([
          "thread",
          thread.type,
          category.name,
          channel.name,
          thread.name,
          thread.id,
          thread.private ? "yes" : "no",
          thread.readableBy.join("; "),
          thread.postableBy.join("; ")
        ]);
      }
    }
  }

  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function formatChannelLine(entry) {
  const last = entry.lastMessageAt ? formatDate(entry.lastMessageAt) : "n/a";
  return `${entry.name} – ${entry.messageCount} msgs, ${entry.uniqueAuthors} authors (last: ${last})`;
}

function formatTopAuthor(entry) {
  const channelPart = entry.topChannelName ? ` in #${entry.topChannelName}` : "";
  return `${entry.displayName || entry.userId}: ${entry.messageCount} msgs${channelPart}`;
}

const EMPTY_FIELD = "\u200b";
function splitFields(lines) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length > 900 && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

const signedNumberFormatter = new Intl.NumberFormat("en-GB", { signDisplay: "always", maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat("en-GB", { signDisplay: "always", maximumFractionDigits: 1, minimumFractionDigits: 0 });
function formatSignedNumber(value) {
  if (!Number.isFinite(value)) return value > 0 ? "+∞" : value < 0 ? "-∞" : "0";
  if (value === 0) return "0";
  return signedNumberFormatter.format(value);
}
function formatPctValue(value) {
  if (value === null || value === undefined) return "n/a";
  if (!Number.isFinite(value)) return value > 0 ? "+∞%" : value < 0 ? "-∞%" : "0%";
  if (value === 0) return "0%";
  return `${pctFormatter.format(value)}%`;
}

export function buildStatsEmbeds(guild, stats, { detail = "summary", limit = 10 } = {}) {
  const embeds = [];
  const rangeLine = `${formatDate(stats.since)} → ${formatDate(stats.until)}`;
  const baseEmbed = new EmbedBuilder()
    .setTitle(`Server stats – ${guild.name}`)
    .setDescription(`Range: ${rangeLine}\nActivity based on stored logs from allowlisted channels.`)
    .setTimestamp(new Date(stats.until));

  if (stats.notes?.length) baseEmbed.setFooter({ text: stats.notes.join(" | ") });

  if (detail === "summary") {
    baseEmbed.addFields(
      {
        name: "Members",
        value: `Total: ${formatNumber(stats.summary.totalMembers)}\nHumans: ${formatNumber(stats.summary.humans)}\nBots: ${formatNumber(stats.summary.bots)}`,
        inline: true
      },
      {
        name: "Channels",
        value: `Total: ${formatNumber(stats.summary.channels.total)}\nText: ${formatNumber(stats.summary.channels.text)}\nVoice: ${formatNumber(stats.summary.channels.voice)}\nStage: ${formatNumber(stats.summary.channels.stage)}\nForum: ${formatNumber(stats.summary.channels.forum)}`,
        inline: true
      },
      {
        name: "Activity",
        value: `Messages: ${formatNumber(stats.summary.activity.messages)}\nUnique authors: ${formatNumber(stats.summary.activity.uniqueAuthors)}\nLogged channels: ${formatNumber(stats.summary.activity.channelsTracked)}`,
        inline: true
      }
    );
    embeds.push(baseEmbed);
    return embeds;
  }

  if (detail === "channels") {
    const lines = stats.channels.slice(0, limit).map(formatChannelLine);
    baseEmbed.setTitle(`Channel activity – ${guild.name}`);
    splitFields(lines.length ? lines : ["No channel activity recorded in this range."])
      .forEach((chunk, idx) => baseEmbed.addFields({ name: idx === 0 ? "Top channels" : EMPTY_FIELD, value: chunk }));
    embeds.push(baseEmbed);
    return embeds;
  }

  if (detail === "roles") {
    const lines = stats.roles.map(r => `${r.name}: ${formatNumber(r.memberCount)} members`);
    baseEmbed.setTitle(`Role distribution – ${guild.name}`);
    splitFields(lines.length ? lines : ["No role data available."])
      .forEach((chunk, idx) => baseEmbed.addFields({ name: idx === 0 ? "Roles" : EMPTY_FIELD, value: chunk }));
    embeds.push(baseEmbed);
    return embeds;
  }

  if (detail === "members") {
    const lines = stats.members.newMembers.map(m => `${m.displayName} (joined ${formatDate(m.joinedAt)})`);
    baseEmbed.setTitle(`Recent members – ${guild.name}`);
    splitFields(lines.length ? lines : ["No member join data available for this range."])
      .forEach((chunk, idx) => baseEmbed.addFields({ name: idx === 0 ? "New members" : EMPTY_FIELD, value: chunk }));
    embeds.push(baseEmbed);
    return embeds;
  }

  if (detail === "top") {
    const lines = stats.topAuthors.slice(0, limit).map(formatTopAuthor);
    baseEmbed.setTitle(`Top contributors – ${guild.name}`);
    splitFields(lines.length ? lines : ["No author activity recorded in this range."])
      .forEach((chunk, idx) => baseEmbed.addFields({ name: idx === 0 ? "Members" : EMPTY_FIELD, value: chunk }));
    embeds.push(baseEmbed);
    return embeds;
  }

  embeds.push(baseEmbed);
  return embeds;
}

// ---- Trends embeds ----
export function buildTrendsEmbeds(guild, trends, { limit = 10 } = {}) {
  const rangeDescription = `Prev: ${formatDate(trends.prevSince)} → ${formatDate(trends.prevUntil)}\nCurr: ${formatDate(trends.since)} → ${formatDate(trends.until)}`;
  const baseEmbed = new EmbedBuilder()
    .setTitle(`Trends – ${guild.name}`)
    .setDescription(rangeDescription)
    .setTimestamp(new Date(trends.until));

  if (trends.notes?.length) baseEmbed.setFooter({ text: trends.notes.join(" | ") });

  const totalsLines = [
    `Messages: ${formatNumber(trends.totals.messages.current)} (Δ ${formatSignedNumber(trends.totals.messages.delta)} / ${formatPctValue(trends.totals.messages.pct)})`,
    `Unique authors: ${formatNumber(trends.totals.uniqueAuthors.current)} (Δ ${formatSignedNumber(trends.totals.uniqueAuthors.delta)} / ${formatPctValue(trends.totals.uniqueAuthors.pct)})`,
    `Channels tracked: ${formatNumber(trends.totals.channelsTracked.current)} (Δ ${formatSignedNumber(trends.totals.channelsTracked.delta)} / ${formatPctValue(trends.totals.channelsTracked.pct)})`
  ];
  baseEmbed.addFields({ name: "Totals", value: totalsLines.join("\n"), inline: true });

  const channelLines = (trends.channels || [])
    .slice(0, Math.max(limit, 0))
    .map(e => `${e.name ? `#${e.name}` : e.id}: ${formatSignedNumber(e.delta)} (${formatPctValue(e.pct)})`);
  splitFields(channelLines.length ? channelLines : ["No channel movers found in this range."])
    .forEach((chunk, i) => baseEmbed.addFields({ name: i === 0 ? "Top channel movers" : EMPTY_FIELD, value: chunk }));

  const authorLines = (trends.authors || [])
    .slice(0, Math.max(limit, 0))
    .map(e => `${e.displayName || e.userId}: ${formatSignedNumber(e.delta)} (${formatPctValue(e.pct)})`);
  splitFields(authorLines.length ? authorLines : ["No contributor movers found in this range."])
    .forEach((chunk, i) => baseEmbed.addFields({ name: i === 0 ? "Top contributor movers" : EMPTY_FIELD, value: chunk }));

  return [baseEmbed];
}

// ---- Trends CSV ----
export function toCsvTrendsChannels(trends) {
  const rows = [["channelId", "channelName", "current", "previous", "delta", "pct"]];
  for (const e of trends.channels || []) {
    rows.push([e.id, e.name || "", e.current, e.previous, e.delta, e.pct ?? ""]);
  }
  return rows.map(r => r.map(csvEscape).join(",")).join("\n");
}
export function toCsvTrendsTop(trends) {
  const rows = [["userId", "displayName", "current", "previous", "delta", "pct", "topChannel"]];
  for (const e of (trends.authors || [])) {
    rows.push([e.userId, e.displayName || "", e.current, e.previous, e.delta, e.pct ?? "", e.topChannelName || ""]);
  }
  return rows.map(r => r.map(csvEscape).join(",")).join("\n");
}

export function toCsvChannels(stats) {
  const rows = [["channelId", "channelName", "messageCount", "uniqueAuthors", "lastMessageAt"]];
  for (const entry of stats.channels) {
    rows.push([
      entry.id,
      entry.name,
      entry.messageCount,
      entry.uniqueAuthors,
      entry.lastMessageAt || ""
    ]);
  }
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

export function toCsvTop(stats) {
  const rows = [["userId", "displayName", "messageCount", "topChannel"]];
  for (const entry of stats.topAuthors) {
    rows.push([
      entry.userId,
      entry.displayName || "",
      entry.messageCount,
      entry.topChannelName || ""
    ]);
  }
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}
