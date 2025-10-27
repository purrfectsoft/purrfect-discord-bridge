// src/lib/stats.js
import { ChannelType } from "discord.js";
import { loadWindow } from "../storage.js";

// -------------- existing helpers (safe to keep) --------------
function mapChannelType(channel) {
  if (!channel) return "other";
  switch (channel.type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildStageVoice:
      return "stage";
    case ChannelType.GuildForum:
      return "forum";
    default:
      return "other";
  }
}

function countChannels(guild) {
  const counts = { total: 0, text: 0, voice: 0, stage: 0, forum: 0 };
  for (const channel of guild.channels.cache.values()) {
    if (!channel || channel.type === ChannelType.GuildCategory || channel.isThread?.()) continue;
    counts.total += 1;
    const type = mapChannelType(channel);
    if (counts[type] !== undefined) counts[type] += 1;
  }
  return counts;
}

function formatMemberBreakdown(guild) {
  const total = guild.memberCount ?? null;
  const cacheSize = guild.members.cache.size;
  if (!cacheSize) {
    return { totalMembers: total, humans: null, bots: null, partial: true };
  }
  let humans = 0;
  let bots = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) bots += 1;
    else humans += 1;
  }
  return { totalMembers: total ?? cacheSize, humans, bots, partial: cacheSize < (total ?? cacheSize) };
}

function ensureDate(value, fallback) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return fallback instanceof Date ? fallback : new Date();
}

function authorDisplayName(guild, authorId, fallback) {
  const member = guild.members.cache.get(authorId);
  if (member) return member.displayName || member.user?.username || member.user?.tag || fallback || authorId;
  return fallback || authorId;
}

// -------------- collectStats (keep or overwrite with this identical version) --------------
export async function collectStats(guild, {
  since,
  until,
  limit = 10, // unused here but kept for signature stability
  detail = "summary", // unused here
  allowedChannelIds = []
} = {}) {
  const sinceDate = ensureDate(since, new Date(0));
  const untilDate = ensureDate(until, new Date());
  const sinceISO = sinceDate.toISOString();
  const untilISO = untilDate.toISOString();

  await guild.channels.fetch();
  await guild.roles.fetch().catch(() => null);
  try { await guild.members.fetch({ withPresences: false }); } catch {}

  const memberInfo = formatMemberBreakdown(guild);
  const channelCounts = countChannels(guild);

  const channelStats = [];
  const authorAggregate = new Map();
  const uniqueAuthorsOverall = new Set();
  let totalMessages = 0;
  let emptyChannels = 0;

  for (const channelId of allowedChannelIds) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    const logs = loadWindow({ channelId, sinceISO, untilISO });
    const uniqueAuthors = new Set();
    let lastMessageAt = null;
    for (const message of logs) {
      if (message.authorId) {
        uniqueAuthors.add(message.authorId);
        uniqueAuthorsOverall.add(message.authorId);
        if (!authorAggregate.has(message.authorId)) {
          authorAggregate.set(message.authorId, {
            userId: message.authorId,
            messageCount: 0,
            channels: new Map(),
            displayName: message.author || null
          });
        }
        const agg = authorAggregate.get(message.authorId);
        agg.messageCount += 1;
        agg.channels.set(channelId, (agg.channels.get(channelId) || 0) + 1);
        if (!agg.displayName) agg.displayName = message.author || null;
      }
      if (message.timestamp) lastMessageAt = message.timestamp;
    }
    totalMessages += logs.length;
    if (!logs.length) emptyChannels += 1;
    channelStats.push({
      id: channelId,
      name: channel.name || channelId,
      type: mapChannelType(channel),
      messageCount: logs.length,
      uniqueAuthors: uniqueAuthors.size,
      lastMessageAt
    });
  }

  channelStats.sort((a, b) => b.messageCount - a.messageCount || a.name.localeCompare(b.name));

  const topAuthors = Array.from(authorAggregate.values()).map(entry => {
    const memberName = authorDisplayName(guild, entry.userId, entry.displayName);
    let topChannelId = null;
    let topChannelCount = 0;
    for (const [chId, count] of entry.channels.entries()) {
      if (count > topChannelCount) { topChannelCount = count; topChannelId = chId; }
    }
    const topChannel = topChannelId ? guild.channels.cache.get(topChannelId) : null;
    return {
      userId: entry.userId,
      displayName: memberName,
      messageCount: entry.messageCount,
      topChannelId,
      topChannelName: topChannel?.name || topChannelId || null
    };
  }).sort((a, b) => b.messageCount - a.messageCount || a.displayName.localeCompare(b.displayName));

  const roles = Array.from(guild.roles.cache.values())
    .map(role => ({ id: role.id, name: role.name, memberCount: role.members ? role.members.size : 0 }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  const newMembers = [];
  for (const member of guild.members.cache.values()) {
    if (!member.joinedTimestamp) continue;
    if (member.joinedTimestamp >= sinceDate.getTime() && member.joinedTimestamp <= untilDate.getTime()) {
      newMembers.push({
        userId: member.id,
        displayName: member.displayName || member.user?.username || member.user?.tag || member.id,
        joinedAt: new Date(member.joinedTimestamp).toISOString()
      });
    }
  }
  newMembers.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

  const notes = [];
  if (memberInfo.partial) notes.push("Member counts based on partial cache.");
  if (emptyChannels > 0 && allowedChannelIds.length) notes.push("Some allowlisted channels have no stored logs.");

  return {
    since: sinceISO,
    until: untilISO,
    summary: {
      totalMembers: memberInfo.totalMembers,
      humans: memberInfo.humans,
      bots: memberInfo.bots,
      channels: channelCounts,
      activity: {
        messages: totalMessages,
        uniqueAuthors: uniqueAuthorsOverall.size,
        channelsTracked: channelStats.length
      }
    },
    channels: channelStats,
    roles,
    members: { newMembers },
    topAuthors,
    notes
  };
}

// -------------- trends helpers --------------
function safePct(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  const delta = current - previous;
  return (delta / previous) * 100;
}
function buildDelta(current, previous) {
  return { current, previous, delta: current - previous, pct: safePct(current, previous) };
}
function indexById(list, key) {
  const map = new Map();
  for (const entry of list || []) {
    if (!entry || entry[key] === undefined || entry[key] === null) continue;
    map.set(entry[key], entry);
  }
  return map;
}

// -------------- collectTrends --------------
export async function collectTrends(guild, {
  since,
  until,
  allowedChannelIds = [],
  maxList = 100
} = {}) {
  const sinceDate = ensureDate(since, new Date(0));
  const untilDate = ensureDate(until, new Date());
  const sinceMs = sinceDate.getTime();
  const untilMs = untilDate.getTime();
  const duration = Math.max(untilMs - sinceMs, 0);

  let prevUntilMs = sinceMs - 1;
  if (prevUntilMs < 0) prevUntilMs = 0;
  let prevSinceMs = prevUntilMs - duration;
  if (prevSinceMs < 0) prevSinceMs = 0;

  const prevSinceDate = new Date(prevSinceMs);
  const prevUntilDate = new Date(prevUntilMs);

  const current = await collectStats(guild, { since: sinceDate, until: untilDate, allowedChannelIds });
  const previous = await collectStats(guild, { since: prevSinceDate, until: prevUntilDate, allowedChannelIds });

  const totals = {
    messages: buildDelta(current.summary.activity.messages, previous.summary.activity.messages),
    uniqueAuthors: buildDelta(current.summary.activity.uniqueAuthors, previous.summary.activity.uniqueAuthors),
    channelsTracked: buildDelta(current.summary.activity.channelsTracked, previous.summary.activity.channelsTracked)
  };

  const currentChannels = indexById(current.channels, "id");
  const previousChannels = indexById(previous.channels, "id");
  const channelIds = new Set([...currentChannels.keys(), ...previousChannels.keys()]);
  const channels = [];
  for (const channelId of channelIds) {
    const curr = currentChannels.get(channelId);
    const prev = previousChannels.get(channelId);
    const currentCount = curr?.messageCount ?? 0;
    const previousCount = prev?.messageCount ?? 0;
    if (currentCount === 0 && previousCount === 0) continue;
    channels.push({
      id: channelId,
      name: curr?.name || prev?.name || channelId,
      current: currentCount,
      previous: previousCount,
      delta: currentCount - previousCount,
      pct: safePct(currentCount, previousCount)
    });
  }
  channels.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.name || "").localeCompare(b.name || ""));
  const limitedChannels = channels.slice(0, Math.min(maxList, channels.length));

  const currentAuthors = indexById(current.topAuthors, "userId");
  const previousAuthors = indexById(previous.topAuthors, "userId");
  const authorIds = new Set([...currentAuthors.keys(), ...previousAuthors.keys()]);
  const authors = [];
  for (const authorId of authorIds) {
    const curr = currentAuthors.get(authorId);
    const prev = previousAuthors.get(authorId);
    const currentCount = curr?.messageCount ?? 0;
    const previousCount = prev?.messageCount ?? 0;
    if (currentCount === 0 && previousCount === 0) continue;
    authors.push({
      userId: authorId,
      displayName: curr?.displayName || prev?.displayName || authorId,
      current: currentCount,
      previous: previousCount,
      delta: currentCount - previousCount,
      pct: safePct(currentCount, previousCount),
      topChannelName: curr?.topChannelName || prev?.topChannelName || undefined
    });
  }
  authors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.displayName || "").localeCompare(b.displayName || ""));
  const limitedAuthors = authors.slice(0, Math.min(maxList, authors.length));

  const notes = new Set();
  for (const n of current.notes || []) notes.add(n);
  for (const n of previous.notes || []) notes.add(n);
  if (prevUntilMs === 0 && sinceMs === 0) notes.add("Previous window unavailable for 'all' range.");

  return {
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
    prevSince: prevSinceDate.toISOString(),
    prevUntil: prevUntilDate.toISOString(),
    totals,
    channels: limitedChannels,
    authors: limitedAuthors,
    notes: Array.from(notes)
  };
}
