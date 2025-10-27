import { ChannelType } from "discord.js";
import { loadWindow } from "../storage.js";

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

export async function collectStats(guild, {
  since,
  until,
  limit = 10, // eslint-disable-line no-unused-vars
  detail = "summary", // eslint-disable-line no-unused-vars
  allowedChannelIds = []
} = {}) {
  const sinceDate = ensureDate(since, new Date(0));
  const untilDate = ensureDate(until, new Date());
  const sinceISO = sinceDate.toISOString();
  const untilISO = untilDate.toISOString();

  await guild.channels.fetch();
  await guild.roles.fetch().catch(() => null);
  try {
    await guild.members.fetch({ withPresences: false });
  } catch {
    // ignore member fetch failures (likely due to limited intents)
  }

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
        if (!agg.displayName) {
          agg.displayName = message.author || null;
        }
      }
      if (message.timestamp) {
        lastMessageAt = message.timestamp;
      }
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
      if (count > topChannelCount) {
        topChannelCount = count;
        topChannelId = chId;
      }
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
    .map(role => ({
      id: role.id,
      name: role.name,
      memberCount: role.members ? role.members.size : 0
    }))
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
