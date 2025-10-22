// src/dashboard/render_dashboard.js
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
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20 space-y-4">
      <h2 class="text-lg font-semibold text-slate-100">Runtime</h2>
      <dl class="grid grid-cols-2 gap-4 text-sm text-slate-300">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Bot</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${esc(st.botTag || "—")}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt>
          <dd class="mt-1 text-base font-semibold ${st.ready ? "text-emerald-400" : "text-rose-400"}">${st.ready ? "Online" : "Offline"}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Uptime</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${human(st.uptimeMs)}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Model</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${esc(st.model || "—")}</dd>
        </div>
      </dl>
      <div class="border-t border-slate-800 pt-4">
        <dl class="grid grid-cols-2 gap-4 text-sm text-slate-300">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Daily Cron</dt>
            <dd class="mt-1 text-base font-semibold text-slate-100">${esc(st.dailyCron || "—")}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Last Digest</dt>
            <dd class="mt-1 text-base font-semibold text-slate-100">${st.lastDigestAt ? new Date(st.lastDigestAt).toLocaleString("en-GB", { hour12: false, timeZone: st.tz }) : "—"}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Autosummary</dt>
            <dd class="mt-1 text-base font-semibold text-slate-100">${st.autosummary?.enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Auto Config</dt>
            <dd class="mt-1 text-base font-semibold text-slate-100">${esc(st.autosummary?.cron || "—")} / ${st.autosummary?.min ?? "—"} msgs / ${st.autosummary?.lookback ?? "—"}h</dd>
          </div>
        </dl>
      </div>
    </div>
  `;
}

export function render_allowlist_card(st, { canonicalBaseUrl } = {}) {
  return `
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20 space-y-4">
      <h2 class="text-lg font-semibold text-slate-100">Allowlisted Channels</h2>
      <dl class="grid grid-cols-2 gap-4 text-sm text-slate-300">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Count</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${st.channels.length}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (24h total)</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${st.channels.reduce((a, c) => a + (c.count24h || 0), 0)}</dd>
        </div>
      </dl>
      <div class="border-t border-slate-800 pt-4 space-y-3 text-sm text-slate-300">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">IDs</dt>
          <dd class="mt-1 font-mono text-sm text-slate-400">${esc(st.channels.map(c => c.id).join(", ") || "—")}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Canonical</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${esc(canonicalBaseUrl || "—")}</dd>
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
    <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow shadow-black/10">
      <div class="flex items-center justify-between">
        <span class="inline-flex items-center rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-200">#${esc(ch.name || ch.id)}</span>
        <span class="text-[11px] font-mono text-slate-500">${esc(ch.id)}</span>
      </div>
      <dl class="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (24h)</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${ch.count24h ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Msgs (7d)</dt>
          <dd class="mt-1 text-base font-semibold text-slate-100">${ch.count7d ?? "—"}</dd>
        </div>
      </dl>
    </div>
  `).join("");
  return `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">${cards}</div>`;
}

export function render_forms({ defaultChannelId } = {}) {
  const happeningPlaceholder = esc(process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings");
  return `
    <div id="forms" class="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-black/20 space-y-6">
      <form method="post" action="/note" class="grid gap-3">
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Secret <small class="ml-1 text-[11px] font-normal normal-case text-slate-500">Use your UNIVERSE_WEBHOOK_SECRET</small></label>
        <input name="secret" type="password" placeholder="••••••••" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Channel ID <small class="ml-1 text-[11px] font-normal normal-case text-slate-500">Defaults to summary channel if empty</small></label>
        <input name="channelId" placeholder="${esc(defaultChannelId || "")}" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Section</label>
        <input name="section" placeholder="Manual Notes" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Text</label>
        <textarea name="text" rows="3" placeholder="What should be noted?" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"></textarea>
        <button type="submit" class="mt-2 inline-flex items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60">Post /note</button>
      </form>
      <hr class="border-slate-800"/>
      <form method="post" action="/happening" class="grid gap-3">
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Secret</label>
        <input name="secret" type="password" placeholder="••••••••" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Section</label>
        <input name="section" placeholder="${happeningPlaceholder}" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Text</label>
        <textarea name="text" rows="3" placeholder="Key happening to surface in digests" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"></textarea>
        <button type="submit" class="mt-2 inline-flex items-center justify-center rounded-xl bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60">Post /happening</button>
      </form>
      <hr class="border-slate-800"/>
      <form method="post" action="/digest" class="grid gap-3">
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-400">Secret</label>
        <input name="secret" type="password" placeholder="••••••••" class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"/>
        <button type="submit" class="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60">Trigger /digest now</button>
      </form>
    </div>
  `;
}

export function render_errors(errors) {
  const items = (errors || []).slice(-5).reverse().map(e => `<li class="font-mono text-xs text-rose-300/90"><code>${esc(e)}</code></li>`).join("")
    || '<li class="text-xs text-slate-500">No recent errors</li>';
  return `<ul class="space-y-2">${items}</ul>`;
}

export function render_dashboard(state, options = {}) {
  const { canonicalBaseUrl = "", defaultChannelId = "" } = options;
  const nowStr = new Date().toLocaleString("en-GB", { hour12: false, timeZone: state.tz });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Purrfect Universe — Bridge</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100">
  <div class="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-semibold text-slate-100">🐾 Purrfect Bridge — Dashboard</h1>
      <div class="flex flex-wrap items-center gap-3">
        <button id="refreshToggle" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 shadow-sm shadow-black/20 transition hover:border-slate-500" aria-pressed="false" title="Pause/Resume auto-refresh">⏯︎ Auto-refresh</button>
        <span class="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-medium text-slate-200">
          ${esc(state.tz)} • <span class="text-[11px] text-slate-400">${nowStr}</span>
        </span>
      </div>
    </header>

    <section class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      ${render_runtime_card(state)}
      ${render_allowlist_card(state, { canonicalBaseUrl })}
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-slate-100">Channel Activity</h2>
      ${render_channel_grid(state.channels)}
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-slate-100">Post from Dashboard</h2>
      ${render_forms({ defaultChannelId })}
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-slate-100">Recent Errors</h2>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-black/20">
        ${render_errors(state.errors)}
      </div>
    </section>

    <footer class="pt-4 text-xs text-slate-500">
      Auto-refresh every 30s (pauses while typing or when forms are in view)
      • <a href="/health.json" class="text-slate-400 underline hover:text-slate-200">/health.json</a>
      • Canonical: ${esc(canonicalBaseUrl || "—")}
    </footer>
  </div>

  <script>
  (function(){
    var REFRESH_MS = 30000;
    var paused = false;
    var byFocus = false;
    var byVisibility = false;

    var toggleBtn = document.getElementById('refreshToggle');
    function updateToggleUI(){
      toggleBtn.setAttribute('aria-pressed', String(paused));
      toggleBtn.textContent = (paused ? '▶︎ Resume auto-refresh' : '⏸︎ Pause auto-refresh');
    }
    toggleBtn.addEventListener('click', function(){
      paused = !paused;
      updateToggleUI();
    });
    updateToggleUI();

    document.addEventListener('focusin', function(e){
      if (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) {
        byFocus = true; paused = true; updateToggleUI();
      }
    });
    document.addEventListener('focusout', function(){
      byFocus = false;
      if (!byVisibility) { paused = false; updateToggleUI(); }
    });

    var formsEl = document.getElementById('forms');
    if ('IntersectionObserver' in window && formsEl) {
      var io = new IntersectionObserver(function(entries){
        var entry = entries[0];
        byVisibility = entry && entry.intersectionRatio >= 0.5;
        if (byVisibility) paused = true;
        else if (!byFocus) paused = false;
        updateToggleUI();
      }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
      io.observe(formsEl);
    } else if (formsEl) {
      window.addEventListener('scroll', function(){
        var r = formsEl.getBoundingClientRect();
        byVisibility = (r.top < window.innerHeight * 0.2) && (r.bottom > window.innerHeight * 0.2);
        if (byVisibility) paused = true; else if (!byFocus) paused = false;
        updateToggleUI();
      });
    }

    setInterval(function(){
      if (!paused) { window.location.reload(); }
    }, REFRESH_MS);
  })();
  </script>
</body></html>`;
}

export default render_dashboard;
