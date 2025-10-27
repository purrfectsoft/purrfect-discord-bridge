import dotenv from "dotenv";
dotenv.config();

import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("summary")
    .setDescription("Summarize last N hours from this channel")
    .addIntegerOption(o => o.setName("hours").setDescription("Hours back").setMinValue(1).setMaxValue(168)),
  new SlashCommandBuilder().setName("daily")
    .setDescription("Post the daily summary now (uses default hours)."),
  new SlashCommandBuilder().setName("report")
    .setDescription("Generate a Purrfect Universe style report for this channel."),
  new SlashCommandBuilder().setName("backfill")
    .setDescription("Backfill recent messages into local logs for this channel")
    .addIntegerOption(o => o.setName("hours").setDescription("Only messages newer than X hours").setMinValue(1).setMaxValue(168))
    .addIntegerOption(o => o.setName("limit").setDescription("Max messages to fetch (1-500)").setMinValue(1).setMaxValue(500)),
  new SlashCommandBuilder().setName("map")
    .setDescription("Show a structured map of this server")
    .addStringOption(o => o.setName("format")
      .setDescription("Output format")
      .addChoices(
        { name: "Markdown", value: "markdown" },
        { name: "JSON", value: "json" },
        { name: "CSV", value: "csv" }
      ))
    .addBooleanOption(o => o.setName("include_permissions").setDescription("Include permission summaries"))
    .addBooleanOption(o => o.setName("include_private").setDescription("Include private channels (admin only)"))
    .addStringOption(o => o.setName("category").setDescription("Filter by category name"))
    .addIntegerOption(o => o.setName("max_channels").setDescription("Maximum channels to include").setMinValue(1).setMaxValue(1000)),
  new SlashCommandBuilder().setName("stats")
    .setDescription("Show server statistics")
    .addStringOption(o => o.setName("range")
      .setDescription("Time range to analyze")
      .addChoices(
        { name: "7 days", value: "7d" },
        { name: "30 days", value: "30d" },
        { name: "90 days", value: "90d" },
        { name: "All", value: "all" }
      ))
    .addStringOption(o => o.setName("detail")
      .setDescription("Detail view")
      .addChoices(
        { name: "Summary", value: "summary" },
        { name: "Channels", value: "channels" },
        { name: "Roles", value: "roles" },
        { name: "Members", value: "members" },
        { name: "Top contributors", value: "top" }
      ))
    .addIntegerOption(o => o.setName("limit").setDescription("Max rows in detailed views").setMinValue(1).setMaxValue(50))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function main() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered.");
  } catch (e) {
    console.error("Failed to register commands", e);
    process.exit(1);
  }
}

main();
