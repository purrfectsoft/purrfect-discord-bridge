// src/dashboard/render_dashboard.js
import { readFileSync } from "node:fs";

const dashboardTemplate = readFileSync(new URL("./dashboard.html", import.meta.url), "utf8");
function human(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function render_runtime_card(st) {
  return `
    <div class="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/70 p-6 sm:p-7 shadow-xl shadow-black/25">
      <div class="pointer-events-none absolute inset-x-8 -top-24 h-44 rounded-full bg-gradient-to-br from-brand-emerald-500/20 via-brand-sky-500/10 to-transparent blur-3xl"></div>
      <div class="relative space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <h2 class="text-lg font-semibold text-slate-100">Runtime</h2>
          <span class="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/80 px-3 py-1 text-xs font-semibold ${st.ready ? "text-brand-emerald-300" : "text-rose-300"}">
            <span class="h-2 w-2 rounded-full ${st.ready ? "bg-brand-emerald-400" : "bg-rose-400"}"></span>
            ${st.ready ? "Online" : "Offline"}
          </span>
        </div>
        <dl class="grid grid-cols-1 gap-4 text-sm text-slate-300 sm:grid-cols-2">
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Bot</dt>
            <dd class="text-base font-semibold text-slate-100">${esc(st.botTag || "—")}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Model</dt>
            <dd class="text-base font-semibold text-slate-100">${esc(st.model || "—")}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Uptime</dt>
            <dd class="text-base font-semibold text-slate-100">${human(st.uptimeMs)}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Last Digest</dt>
            <dd class="text-base font-semibold text-slate-100">${st.lastDigestAt ? new Date(st.lastDigestAt).toLocaleString("en-GB", { hour12: false, timeZone: st.tz }) : "—"}</dd>
          </div>
        </dl>
        <div class="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-4 text-sm text-slate-300 sm:grid-cols-2">
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Daily Cron</dt>
            <dd class="text-base font-semibold text-slate-100">${esc(st.dailyCron || "—")}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Autosummary</dt>
            <dd class="text-base font-semibold text-slate-100">${st.autosummary?.enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div class="space-y-1 sm:col-span-2">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Auto Config</dt>
            <dd class="text-base font-semibold text-slate-100">${esc(st.autosummary?.cron || "—")} • ${st.autosummary?.min ?? "—"} msgs • ${st.autosummary?.lookback ?? "—"}h</dd>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function render_allowlist_card(st, { canonicalBaseUrl } = {}) {
  return `
    <div class="rounded-3xl border border-slate-800/60 bg-slate-900/70 p-6 sm:p-7 shadow-xl shadow-black/25">
      <div class="space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <h2 class="text-lg font-semibold text-slate-100">Allowlisted Channels</h2>
          <span class="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-slate-300">${st.channels.length} total</span>
        </div>
        <dl class="grid grid-cols-1 gap-4 text-sm text-slate-300 sm:grid-cols-2">
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (24h total)</dt>
            <dd class="text-base font-semibold text-slate-100">${st.channels.reduce((a, c) => a + (c.count24h || 0), 0)}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Canonical</dt>
            <dd class="text-base font-semibold text-slate-100">${esc(canonicalBaseUrl || "—")}</dd>
          </div>
        </dl>
        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/70 p-4 text-sm text-slate-300">
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Channels</dt>
          <dd class="mt-3 flex flex-wrap gap-2">
            ${st.channels.length
              ? st.channels.map(c => `
                <span title="${esc(c.id)}" class="inline-flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-200">
                  <span class="truncate">#${esc(c.name || c.id)}</span>
                </span>
              `).join("")
              : '<span class="text-xs text-slate-500">No allowlisted channels</span>'}
          </dd>
        </div>
      </div>
    </div>
  `;
}

export function render_channel_grid(channels) {
  if (!channels?.length) {
    return `<div class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">No channels</div>`;
  }
  const cards = channels.map(ch => `
    <div class="flex h-full flex-col rounded-3xl border border-slate-800/60 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
      <div class="flex flex-wrap items-center gap-3">
        <span class="max-w-full shrink min-w-0 truncate rounded-full bg-slate-800/80 px-3 py-1 text-sm font-medium text-slate-100">#${esc(ch.name || ch.id)}</span>
        <span class="shrink-0 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-mono text-slate-400">${esc(ch.id)}</span>
      </div>
      <dl class="mt-5 grid grid-cols-2 gap-4 text-sm text-slate-300">
        <div class="space-y-1">
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (24h)</dt>
          <dd class="text-base font-semibold text-slate-100">${ch.count24h ?? "—"}</dd>
        </div>
        <div class="space-y-1">
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (7d)</dt>
          <dd class="text-base font-semibold text-slate-100">${ch.count7d ?? "—"}</dd>
        </div>
      </dl>
    </div>
  `).join("");
  return `<div class="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">${cards}</div>`;
}

export function render_forms({ defaultChannelId } = {}) {
  const happeningPlaceholder = esc(process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings");
  return `
    <div id="forms" class="rounded-3xl border border-slate-800/60 bg-slate-900/70 p-6 sm:p-7 shadow-xl shadow-black/20 space-y-8">
      <div class="space-y-2">
        <p class="text-sm text-slate-400">Use these quick actions to capture notes, flag key happenings, or trigger a digest directly from the dashboard.</p>
        <div class="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
          <label for="sharedSecretField" class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bridge Secret
            <span class="text-[11px] font-normal normal-case text-slate-500">Applied to every request — use your UNIVERSE_WEBHOOK_SECRET.</span>
          </label>
          <input id="sharedSecretField" name="secret" type="password" placeholder="••••••••" class="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-sky-500 focus:outline-none focus:ring-2 focus:ring-brand-sky-500/40" autocomplete="off"/>
        </div>
      </div>
      <div id="formFlash" class="text-sm text-slate-400" role="status" aria-live="polite"></div>
      <div class="grid gap-6 lg:grid-cols-3">
        <form id="noteForm" method="post" action="/note" hx-post="/note" hx-target="#formFlash" hx-swap="innerHTML" hx-include="#sharedSecretField" hx-on::after-request="if (event.detail.successful) this.reset()" class="flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-5">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-slate-100">Add /note</h3>
            <p class="text-xs text-slate-400">Capture quick notes straight into the digest stream.</p>
          </div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Channel ID <small class="ml-1 text-[11px] font-normal normal-case text-slate-500">Defaults to summary channel if empty</small></label>
          <input name="channelId" placeholder="${esc(defaultChannelId || "")}" class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-sky-500 focus:outline-none focus:ring-2 focus:ring-brand-sky-500/40"/>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Section</label>
          <input name="section" placeholder="Manual Notes" class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-sky-500 focus:outline-none focus:ring-2 focus:ring-brand-sky-500/40"/>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Text</label>
          <textarea name="text" rows="3" placeholder="What should be noted?" class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-sky-500 focus:outline-none focus:ring-2 focus:ring-brand-sky-500/40"></textarea>
          <button type="submit" class="mt-auto inline-flex items-center justify-center rounded-2xl bg-brand-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-sky-500/30 transition hover:bg-brand-sky-400 focus:outline-none focus:ring-2 focus:ring-brand-sky-500/60">Post /note</button>
        </form>
        <form id="happeningForm" method="post" action="/happening" hx-post="/happening" hx-target="#formFlash" hx-swap="innerHTML" hx-include="#sharedSecretField" hx-on::after-request="if (event.detail.successful) this.reset()" class="flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-5">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-slate-100">Add /happening</h3>
            <p class="text-xs text-slate-400">Highlight noteworthy updates for the automated digest.</p>
          </div>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Section</label>
          <input name="section" placeholder="${happeningPlaceholder}" class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-purple-500 focus:outline-none focus:ring-2 focus:ring-brand-purple-500/40"/>
          <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Text</label>
          <textarea name="text" rows="3" placeholder="Key happening to surface in digests" class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-purple-500 focus:outline-none focus:ring-2 focus:ring-brand-purple-500/40"></textarea>
          <button type="submit" class="mt-auto inline-flex items-center justify-center rounded-2xl bg-brand-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-purple-500/30 transition hover:bg-brand-purple-400 focus:outline-none focus:ring-2 focus:ring-brand-purple-500/60">Post /happening</button>
        </form>
        <form id="digestForm" method="post" action="/digest" hx-post="/digest" hx-target="#formFlash" hx-swap="innerHTML" hx-include="#sharedSecretField" hx-on::after-request="if (event.detail.successful) this.reset()" class="flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-5">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-slate-100">Trigger /digest</h3>
            <p class="text-xs text-slate-400">Manually kick off a digest run when you need it.</p>
          </div>
          <button type="submit" class="mt-auto inline-flex items-center justify-center rounded-2xl bg-brand-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-emerald-500/30 transition hover:bg-brand-emerald-400 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/60">Trigger /digest now</button>
        </form>
      </div>
    </div>
  `;
}

export function render_errors(errors) {
  const items = (errors || []).slice(-5).reverse().map(e => `<li class="font-mono text-xs text-rose-300/90"><code>${esc(e)}</code></li>`).join("")
    || '<li class="text-xs text-slate-500">No recent errors</li>';
  return `<ul class="space-y-2">${items}</ul>`;
}

export function render_metrics(state, options = {}) {
  const { canonicalBaseUrl = "" } = options;
  const nowStr = new Date().toLocaleString("en-GB", { hour12: false, timeZone: state.tz });
  return `
    <div id="metrics" hx-get="/metrics" hx-trigger="load, every 30s" hx-target="#metrics" hx-swap="outerHTML">
      <header class="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950/90 p-6 sm:p-8 shadow-xl shadow-black/30">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.15),transparent_45%)]"></div>
        <div class="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-2 text-balance">
            <h1 class="text-2xl font-semibold text-slate-100 sm:text-3xl">🐾 Purrfect Bridge</h1>
            <p class="text-sm text-slate-400 sm:text-base">Realtime visibility into summaries, happenings, and bridge health.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-xs font-medium text-slate-200">
              <span class="rounded-full bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-300">${esc(state.tz)}</span>
              <span class="text-[11px] text-slate-400">${nowStr}</span>
            </span>
            <span class="inline-flex items-center gap-2 rounded-full bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-sky-500"></span>
              Live refresh every 30s
            </span>
          </div>
        </div>
      </header>

      <section class="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        ${render_runtime_card(state)}
        ${render_allowlist_card(state, { canonicalBaseUrl })}
      </section>

      <section class="mt-12 space-y-5">
        <h2 class="text-lg font-semibold text-slate-100">Channel Activity</h2>
        ${render_channel_grid(state.channels)}
      </section>

      <section class="mt-12 space-y-5">
        <h2 class="text-lg font-semibold text-slate-100">Recent Errors</h2>
        <div class="rounded-3xl border border-slate-800/60 bg-slate-900/70 p-6 sm:p-7 shadow-xl shadow-black/20">
          ${render_errors(state.errors)}
        </div>
      </section>
    </div>
  `;
}

export function render_dashboard(state, options = {}) {
  const { canonicalBaseUrl = "", defaultChannelId = "" } = options;
  const metricsHtml = render_metrics(state, { canonicalBaseUrl });
  const formsHtml = render_forms({ defaultChannelId });
  const canonical = esc(canonicalBaseUrl || "—");

  return dashboardTemplate
    .replace("<!--METRICS-->", metricsHtml)
    .replace("<!--FORMS-->", formsHtml)
    .replace("<!--CANONICAL-->", canonical);
}

export default render_dashboard;
