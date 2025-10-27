import { ChannelType, PermissionFlagsBits } from "discord.js";

const CHANNEL_TYPE_NAMES = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildVoice]: "voice",
  [ChannelType.GuildStageVoice]: "stage",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildAnnouncement]: "text",
  [ChannelType.PublicThread]: "thread",
  [ChannelType.PrivateThread]: "thread",
  [ChannelType.AnnouncementThread]: "thread"
};

const CHANNEL_EMOJIS = {
  text: "#",
  voice: "🔊",
  stage: "🎙️",
  forum: "🗂️",
  thread: "🧵"
};

function mapChannelType(channel) {
  return CHANNEL_TYPE_NAMES[channel.type] || "text";
}

function summariseRoleOverwrite(overwrite, { roleName }) {
  const tokens = [];
  if (overwrite.allow.has(PermissionFlagsBits.ViewChannel)) tokens.push("+view");
  if (overwrite.deny.has(PermissionFlagsBits.ViewChannel)) tokens.push("-view");
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) tokens.push("+send");
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) tokens.push("-send");
  if (overwrite.allow.has(PermissionFlagsBits.Connect)) tokens.push("+connect");
  if (overwrite.deny.has(PermissionFlagsBits.Connect)) tokens.push("-connect");
  if (overwrite.allow.has(PermissionFlagsBits.Speak)) tokens.push("+speak");
  if (overwrite.deny.has(PermissionFlagsBits.Speak)) tokens.push("-speak");
  if (!tokens.length) return null;
  return `${roleName}: ${tokens.join(", ")}`;
}

function collectPermissionSummary(channel, guild) {
  if (!channel.permissionOverwrites?.cache?.size) {
    return { lines: [], readable: [], postable: [] };
  }
  const lines = [];
  const readable = new Set();
  const postable = new Set();
  const everyone = guild.roles.everyone;
  const overwrites = Array.from(channel.permissionOverwrites.cache.values())
    .filter(o => o.type === 0) // Role
    .slice(0, 10); // safety guard before trimming later

  for (const overwrite of overwrites) {
    const role = guild.roles.cache.get(overwrite.id);
    if (!role || role.id === everyone.id) continue;
    const roleName = role.name || "(unnamed role)";
    const summary = summariseRoleOverwrite(overwrite, { roleName });
    if (summary) {
      lines.push(summary);
      if (overwrite.allow.has(PermissionFlagsBits.ViewChannel)) readable.add(roleName);
      if (overwrite.allow.has(PermissionFlagsBits.SendMessages) || overwrite.allow.has(PermissionFlagsBits.Speak) || overwrite.allow.has(PermissionFlagsBits.Connect)) {
        postable.add(roleName);
      }
    }
  }

  return {
    lines: lines.slice(0, 5),
    readable: Array.from(readable).slice(0, 10),
    postable: Array.from(postable).slice(0, 10)
  };
}

export async function guildToTree(guild, {
  allowPrivate = false,
  includePerms = false,
  categoryFilter = null,
  maxChannels = 300
}, invokerMember) {
  const safeMax = Math.min(Math.max(Number.isFinite(maxChannels) ? maxChannels : 300, 1), 1000);
  await guild.channels.fetch();
  await guild.roles.fetch().catch(() => null);

  const allChannels = Array.from(guild.channels.cache.values())
    .filter(ch => ch && ch.type !== ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
  const categories = Array.from(guild.channels.cache.values())
    .filter(ch => ch.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

  const filterLower = categoryFilter ? categoryFilter.toLowerCase() : null;
  const categoryMap = new Map();
  const ensureCategory = (channel) => {
    const parentId = channel.parentId || "uncategorized";
    if (!categoryMap.has(parentId)) {
      let catObj;
      if (parentId === "uncategorized") {
        catObj = {
          id: "uncategorized",
          name: "Uncategorized",
          position: Number.MAX_SAFE_INTEGER,
          channels: []
        };
      } else {
        const cat = categories.find(c => c.id === parentId);
        if (!cat) return null;
        catObj = {
          id: cat.id,
          name: cat.name,
          position: cat.rawPosition ?? 0,
          channels: []
        };
      }
      categoryMap.set(parentId, catObj);
    }
    return categoryMap.get(parentId);
  };

  let includedChannels = 0;
  let truncated = false;
  const treeCategories = [];

  const matchesFilter = (catName) => {
    if (!filterLower) return true;
    if (!catName) return "uncategorized".includes(filterLower);
    return catName.toLowerCase().includes(filterLower);
  };

  for (const channel of allChannels) {
    const parent = channel.parent ?? null;
    if (!matchesFilter(parent?.name)) continue;

    const perms = invokerMember ? channel.permissionsFor(invokerMember) : null;
    const canView = perms ? perms.has(PermissionFlagsBits.ViewChannel, true) : true;
    if (!allowPrivate && !canView) continue;

    if (includedChannels >= safeMax) {
      truncated = true;
      break;
    }

    const category = ensureCategory(channel);
    if (!category) continue;

    const channelType = mapChannelType(channel);
    const summary = includePerms ? collectPermissionSummary(channel, guild) : { lines: [], readable: [], postable: [] };

    const channelEntry = {
      id: channel.id,
      name: channel.name,
      type: channelType,
      position: channel.rawPosition ?? 0,
      parentId: category.id,
      parentName: category.name,
      private: !canView,
      permissionSummary: summary.lines,
      readableBy: summary.readable,
      postableBy: summary.postable,
      threads: []
    };

    category.channels.push(channelEntry);
    includedChannels += 1;

    if (channel.isThread()) continue;

    if (typeof channel.threads?.fetchActive === "function") {
      try {
        const fetched = await channel.threads.fetchActive();
        for (const thread of fetched.threads.values()) {
          const threadPerms = invokerMember ? thread.permissionsFor(invokerMember) : null;
          const threadCanView = threadPerms ? threadPerms.has(PermissionFlagsBits.ViewChannel, true) : true;
          if (!allowPrivate && !threadCanView) continue;
          const threadSummary = includePerms ? collectPermissionSummary(thread, guild) : { lines: [], readable: [], postable: [] };
          channelEntry.threads.push({
            id: thread.id,
            name: thread.name,
            type: "thread",
            position: thread.rawPosition ?? 0,
            parentId: channel.id,
            private: !threadCanView,
            permissionSummary: threadSummary.lines,
            readableBy: threadSummary.readable,
            postableBy: threadSummary.postable
          });
        }
        channelEntry.threads.sort((a, b) => a.position - b.position);
      } catch {
        // ignore thread fetch issues
      }
    }
  }

  for (const catObj of categoryMap.values()) {
    if (!catObj.channels.length) continue;
    catObj.channels.sort((a, b) => a.position - b.position);
    treeCategories.push(catObj);
  }

  treeCategories.sort((a, b) => a.position - b.position);

  const guildMeta = {
    id: guild.id,
    name: guild.name,
    createdAt: guild.createdAt ? guild.createdAt.toISOString() : null,
    memberCount: guild.memberCount ?? null,
    roleCount: guild.roles.cache.size
  };

  return {
    guildMeta,
    categories: treeCategories,
    truncated,
    emojiMap: CHANNEL_EMOJIS
  };
}
