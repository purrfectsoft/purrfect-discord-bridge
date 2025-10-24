import OpenAI from "openai";

import type { LoggedMessage, SummarizeMessagesInput } from "./types.js";

const defaultTz = process.env.TIMEZONE || "Asia/Dhaka";

function fmt(dt: string | number | Date): string {
	try {
		return new Intl.DateTimeFormat("en-GB", {
			timeZone: defaultTz,
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

const systemPrompt = `You are Purrfect Universe's diligent AI secretary.

GROUND RULES (IMPORTANT):
- Do NOT fabricate or guess. Only summarize what is present.
- If there are absolutely no messages provided, reply exactly: "#PleaseDeleteMe"
- If there ARE messages but none are clearly actionable or project-related, include a **Miscellaneous** section for general chatter/links/reactions.
- Only include owners, dates, or decisions when explicitly stated.
- Prefer concise bullets. Aggregate duplicate points. Summaries should be readable by busy leadership.
- Respect privacy: never output personal phone numbers, emails, or long IDs.

OUTPUT GUIDELINES:
Include only sections that have content. Use this order when applicable:
1) Top 5 Highlights
2) Project/Channel Updates
3) Decisions & Owners (quote or closely paraphrase)
4) Risks/Blockers
5) Action Items (who, what, when)
6) Miscellaneous (if there was chatter with no clear actions)
7) Suggestions (max 3, only if grounded in the messages)`;

export async function summarizeMessages({
	messages,
	model,
	hours,
	tz,
}: SummarizeMessagesInput): Promise<string> {
	if (!messages?.length) {
		return "#PleaseDeleteMe";
	}

	const now = new Date();
	const header = `Time window: last ${hours}h, as of ${fmt(now)} ${tz || defaultTz}`;

	const MAX_LINES = 800;
	const safe: LoggedMessage[] = messages.slice(-MAX_LINES);

	const content = safe
		.map((m) => {
			const t = fmt(m.timestamp);
			const author = (m.author ?? "").toString();
			const text = (m.text ?? "").toString();
			return `[${t}] ${author}: ${text}`;
		})
		.join("\n");

	const userPrompt = `${header}\n\nDiscord excerpts (chronological):\n${content}\n\nRemember: do not invent projects/owners/dates. Use 'Miscellaneous' if needed.`;

	const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

	const resp = await openai.chat.completions.create({
		model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
		temperature: 0,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
	});

	const out = resp.choices?.[0]?.message?.content?.trim() ?? "#PleaseDeleteMe";

	return out.length
		? out
		: "Miscellaneous\n- Conversations occurred, but nothing actionable was detected.";
}
