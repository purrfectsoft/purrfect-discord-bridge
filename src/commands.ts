import dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

dotenv.config();

const commands = [
	new SlashCommandBuilder()
		.setName("summary")
		.setDescription("Summarize last N hours from this channel")
		.addIntegerOption((o) =>
			o
				.setName("hours")
				.setDescription("Hours back")
				.setMinValue(1)
				.setMaxValue(168),
		),
	new SlashCommandBuilder()
		.setName("daily")
		.setDescription("Post the daily summary now (uses default hours)."),
	new SlashCommandBuilder()
		.setName("report")
		.setDescription(
			"Generate a Purrfect Universe style report for this channel.",
		),
	new SlashCommandBuilder()
		.setName("backfill")
		.setDescription("Backfill recent messages into local logs for this channel")
		.addIntegerOption((o) =>
			o
				.setName("hours")
				.setDescription("Only messages newer than X hours")
				.setMinValue(1)
				.setMaxValue(168),
		)
		.addIntegerOption((o) =>
			o
				.setName("limit")
				.setDescription("Max messages to fetch (1-500)")
				.setMinValue(1)
				.setMaxValue(500),
		),
].map((builder) => builder.toJSON());

const rest = new REST({ version: "10" }).setToken(
	process.env.DISCORD_TOKEN ?? "",
);

async function main(): Promise<void> {
	try {
		const appId = process.env.DISCORD_CLIENT_ID;
		const guildId = process.env.DISCORD_GUILD_ID;
		if (!appId || !guildId) {
			throw new Error("DISCORD_CLIENT_ID and DISCORD_GUILD_ID must be set");
		}
		await rest.put(Routes.applicationGuildCommands(appId, guildId), {
			body: commands,
		});
		console.log("✅ Slash commands registered.");
	} catch (error) {
		console.error("Failed to register commands", error);
		process.exitCode = 1;
	}
}

void main();
