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
    .addIntegerOption(o => o.setName("limit").setDescription("Max messages to fetch (1-500)").setMinValue(1).setMaxValue(500))
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
