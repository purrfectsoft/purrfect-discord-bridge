# 🐾 Purrfect Discord → ChatGPT Bridge  
**Automated AI summaries, digests, and dashboards for your Discord universe**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-blue)]()
[![Discord.js](https://img.shields.io/badge/discord.js-v14.15.3-7289da)]()
[![Yarn](https://img.shields.io/badge/built%20with-yarn-2C8EBB)]()

---

## ✨ Motivation

Teams talk; context evaporates.  
This bridge captures conversations from selected Discord channels and converts them into concise, privacy-respecting summaries and reports — powered by OpenAI.

Originally built for the **Purrfect Universe**, it is now released by **Purrfect Software Limited (PSL)** to help any remote-first or async-heavy team maintain context, alignment, and clarity.

---

## 🚀 Features

| Type | Description |
|------|--------------|
| 🧠 **AI Summaries** | Uses OpenAI GPT models (`gpt-4o-mini` by default) to summarize real messages, never fabricating missing data. |
| 🕒 **Scheduled Digests** | Daily cron (default `21:00 Asia/Dhaka`) posting channel and cross-channel summaries. |
| ⚙️ **Slash Commands** | `/summary`, `/daily`, `/report`, `/backfill` — on-demand insights. |
| 🔒 **Privacy Guardrails** | Allowlisted channels only; PII redaction and opt-out keyword `#noai`. |
| 🧱 **Structured Storage** | Compact per-day JSON logs under `data/logs/`, plus optional `notes/` and `keyhappenings.json`. |
| 🌐 **Webhook API** | `/note`, `/happening`, `/digest` endpoints for programmatic updates. |
| 📊 **Dashboard & Quick Actions** | Tailwind + HTMX dashboard with live metrics, toast feedback, and `/note`/`/happening`/`/digest` forms, plus `/health.json`. |
| ⚡ **Autosummary Mode** | Optional interval summaries for high-traffic channels. |
| 🧩 **Extensible** | Each subsystem (storage, redact, summarizer, dashboard) is modular and independent. |

---

## 🧾 Slash Commands

| Command | Description |
|----------|-------------|
| `/summary [hours]` | Summarize the last _N_ hours of this channel. |
| `/daily` | Manually post a daily digest (same as cron). |
| `/report` | Generate an embed-based report. |
| `/backfill [hours] [limit]` | Fetch historical messages into local JSON logs. |

---

## 🧰 Tech Stack

- **Node.js ≥ 22** (manage via [NVM](https://github.com/nvm-sh/nvm))
```bash
nvm use
````
* **TypeScript** (compiled via `tsc` → `dist/`)
* **discord.js v14**
* **OpenAI API v4**
* **cron + luxon** for scheduling and time zones
* **Native HTTP** (no Express) for webhooks and dashboard
* **Biome** for linting & formatting

---

## ⚙️ Configuration

Duplicate `.env.example` → `.env` and set:

```ini
# Discord
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=123456789012345678
DISCORD_GUILD_ID=123456789012345678
DISCORD_ALLOWED_CHANNEL_IDS=111111111111111111,222222222222222222
DISCORD_SUMMARY_CHANNEL_ID=333333333333333333
INVITE_PERMISSIONS=84992

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Scheduling
TIMEZONE=Asia/Dhaka
DAILY_SUMMARY_CRON=0 21 * * *
SUMMARY_HOURS_DEFAULT=24

# Autosummary (optional)
AUTOSUMMARY_ENABLED=false
AUTOSUMMARY_INTERVAL_CRON=*/30 * * * *
AUTOSUMMARY_MIN_MESSAGES=25
AUTOSUMMARY_LOOKBACK_HOURS=6
AUTOSUMMARY_TARGET_CHANNEL_ID=

# Server (dashboard + webhook share one port)
SERVER_PORT=3000
SERVER_HOST=127.0.0.1
CANONICAL_BASE_URL=https://discord-bridge.example.com

# Auth
UNIVERSE_WEBHOOK_SECRET=change_me

# Behavior
REDACT_PII=true
OPT_OUT_KEYWORD="#noai"
MAX_CONTEXT_MESSAGES=500
DATA_DIR=./data
KEYHAPPENINGS_SECTION_NAME=Key Happenings
```

---

## 📦 Project Structure

```
src/
├─ index.ts            # Main entry, Discord client, cron jobs
├─ summarizer.ts       # OpenAI summarization (no hallucination policy)
├─ storage.ts          # JSON log storage (append/load window)
├─ redact.ts           # PII and #noai filtering
├─ happenings.ts       # Persistent "Key Happenings" from chat/webhook
├─ notes.ts            # Manual notes subsystem
├─ server.ts           # Unified dashboard + HTMX forms + /health.json
├─ dashboard/          # Tailwind HTML template + renderer helpers
├─ commands.ts         # Slash command registration
├─ types.ts            # Shared interfaces
└─ utils/time.ts       # Timezone helpers
```

---

## 🧭 Dashboard Quick Actions

The dashboard (served from `SERVER_HOST:SERVER_PORT`) blends live metrics with HTMX-powered controls:

* **Bridge secret input** — enter your `UNIVERSE_WEBHOOK_SECRET` once; every form automatically includes it.
* **Quick forms for `/note`, `/happening`, `/digest`** — launch notes, highlight happenings, or trigger a digest directly from the browser. Buttons expose loading spinners while HTMX handles the POST.
* **Accessible toast feedback** — sanitized success and error messages surface as animated toasts that work well for screen readers and copying into incident threads.
* **Auto-refreshing metrics** — runtime, allowlist, and channel activity cards refresh every 30 seconds without a full page reload.

Set `CANONICAL_BASE_URL` if you want the dashboard footer to surface a preferred production URL.

---

## 🧩 Usage

### 1️⃣ Install

```bash
git clone https://github.com/purrfectsoft/purrfect-discord-bridge.git
cd purrfect-discord-bridge
yarn install
```

> ℹ️ This project now compiles from TypeScript. Run `yarn build` whenever you need the latest JavaScript output in `dist/` (for example before `yarn start`).

### 2️⃣ Register Slash Commands

```bash
yarn register-commands
```

### 3️⃣ Run Locally

```bash
yarn dev              # TSX watcher for local development
# or, build then run the compiled output
yarn build
yarn start
```

Visit **[http://localhost:3000](http://localhost:3000)** for the dashboard
and **[http://localhost:3000/health.json](http://localhost:3000/health.json)** for machine-readable status.

### 4️⃣ Developer Tooling

```bash
yarn typecheck        # Strict TypeScript checks
yarn lint             # Biome lint (use `yarn lint:fix` to auto-fix)
yarn format           # Biome formatter
yarn test             # Node test runner via TSX
```

---

## 🌐 Webhook API

| Endpoint     | Method | Description                                         |
| ------------ | ------ | --------------------------------------------------- |
| `/note`      | POST   | Add a manual note (`text`, `channelId`, `section`). |
| `/happening` | POST   | Record a “Key Happening” (team updates, etc.).      |
| `/digest`    | POST   | Trigger digest generation.                          |

**Auth:**
Each request must include
`x-universe-secret: $UNIVERSE_WEBHOOK_SECRET`

### Example

```bash
curl -X POST https://yourbridge/happening \
  -H "content-type: application/json" \
  -H "x-universe-secret: $UNIVERSE_WEBHOOK_SECRET" \
  -d '{"text":"Motion Mechanics MVP deployed","author":"CI"}'
```

---

## 📊 Dashboard

| Route          | Purpose                           |
| -------------- | --------------------------------- |
| `/`            | Live Tailwind + HTMX dashboard with quick actions |
| `/health.json` | JSON status for uptime monitoring |

Displays:

* Bot online/offline status & uptime
* OpenAI model currently in use
* Daily cron and autosummary configuration, including autosummary thresholds
* Channel message counts (24h / 7d)
* Recent errors with newest first
* Toast feedback after posting `/note`, `/happening`, or `/digest`

---

## 🧱 Development Notes

* Messages exceeding 2000 characters are chunked automatically.
* `summarizer.js` guarantees **no hallucination** — if no messages, returns `"No Discord activity found..."`.
* Logs rotate by day; you can backfill missed messages anytime.
* Notes and happenings are automatically redacted and timestamped.
* Dashboard refreshes every 30s via HTMX partials and is safe to proxy via Nginx.

---

## 🧩 Contributing

1. Fork this repository
2. Create a feature branch
3. Commit with a clear message
4. Push and open a Pull Request

Areas that need love ❤️

* Multilingual summary support
* New dashboard metrics
* Advanced redaction rules
* CI-based “Key Happening” emitters

---

## 🧪 Development Checklist

* ✅ Node ≥ 22 (`nvm use`)
* ✅ Discord bot with “Message Content Intent” enabled
* ✅ `.env` configured
* ✅ Slash commands registered (`yarn register-commands`)
* ✅ `yarn start` → bot online → dashboard accessible

---

## 🪪 License

Released under the **MIT License**.
© 2025 [Purrfect Software Limited](https://www.purrfectsoft.co.uk)

> “Purrfection ≠ Perfection — it’s humane excellence.”

---