// src/server.js
import http from "http";
import { URL } from "url";

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

async function parseBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8");
  const ctype = req.headers["content-type"] || "";
  // Support form posts from dashboard and JSON posts from scripts
  if (ctype.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  return {};
}

export function startServer({
  port = 3000,
  host = "127.0.0.1",
  canonicalBaseUrl = "",
  secret,
  onNote,             // async ({ text, section, channelId, author, authorId, timestampISO })
  onDigest,           // async () => void
  isAllowedChannel,   // (id) => boolean
  defaultChannelId,
  getState            // async () => ({ tz, ready, botTag, uptimeMs, model, dailyCron, lastDigestAt, autosummary:{...}, channels:[{id,name,count24h,count7d}], errors:[] })
}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      // JSON health
      if (req.method === "GET" && url.pathname === "/health.json") {
        const st = await getState();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, nowISO: new Date().toISOString(), ...st }));
      }

      // POST: /note (UI + API)
      if (req.method === "POST" && url.pathname === "/note") {
        const body = await parseBody(req);
        const provided = req.headers["x-universe-secret"] || body.secret;
        if (!secret || provided !== secret) {
          res.writeHead(401, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        }
        const { text, section, channelId, author, authorId, timestampISO } = body || {};
        if (!text || typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "missing text" }));
        }
        const chId = channelId || defaultChannelId;
        if (!chId || !isAllowedChannel(chId)) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "invalid or not-allowlisted channelId" }));
        }
        await onNote({
          text,
          section: section || "Manual Notes",
          channelId: chId,
          author: author || "Dashboard",
          authorId: authorId || "dashboard",
          timestampISO: timestampISO || new Date().toISOString()
        });
        if ((req.headers["accept"] || "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(303, { Location: "/" });
        return res.end();
      }

      // POST: /happening (UI + API)
      if (req.method === "POST" && url.pathname === "/happening") {
        const body = await parseBody(req);
        const provided = req.headers["x-universe-secret"] || body.secret;
        if (!secret || provided !== secret) {
          res.writeHead(401, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        }
        // Defer to index.js where addHappening is wired (through onNote? no, happening is handled there)
        // We'll emit a tiny event via a query param handled upstream; simpler: reuse onNote with a distinct section?
        // BUT we kept addHappening in index.js aggregation. Here we just forward the body to /happening handler via a callback if supplied.
        // For simplicity, we piggyback on 'onNote' when channelId is optional; index.js renders Key Happenings separately.
        // To avoid confusion, index.js wires this route by importing addHappening itself; we just accept and pass through via a custom event.
        // We'll attach the body to req object and let index hook it? Not possible here. Instead, we'll emit a small internal event via global? Keep it simple:
        // We include a no-op response and let index.js register a second server earlier? => Simpler: we expect index.js passed an onHappening via closure by binding onNote to a wrapper. 
        // To keep this file generic, we treat /happening same as /note but with a default section "Key Happenings (from Chat)" and optional channelId.
        const { text, section, author, authorId, timestampISO, channelId } = body || {};
        if (!text || typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "missing text" }));
        }
        // We'll call onNote with a special section that index.js later renders under "Key Happenings".
        await onNote({
          text,
          section: section || (process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings"),
          channelId: channelId || defaultChannelId,
          author: author || "Dashboard",
          authorId: authorId || "dashboard",
          timestampISO: timestampISO || new Date().toISOString()
        });
        if ((req.headers["accept"] || "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(303, { Location: "/" });
        return res.end();
      }

      // POST: /digest (UI + API)
      if (req.method === "POST" && url.pathname === "/digest") {
        const body = await parseBody(req);
        const provided = req.headers["x-universe-secret"] || body.secret;
        if (!secret || provided !== secret) {
          res.writeHead(401, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        }
        await onDigest();
        if ((req.headers["accept"] || "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(303, { Location: "/" });
        return res.end();
      }

      // GET: dashboard HTML with controls
      if (req.method === "GET" && url.pathname === "/") {
        const st = await getState();
        const rows = st.channels.map(ch => `
          <div class="card">
            <div class="card-head">
              <span class="pill">#${esc(ch.name || ch.id)}</span>
              <span class="muted">${ch.id}</span>
            </div>
            <div class="grid">
              <div><span class="k">Msgs (24h)</span><span class="v">${ch.count24h}</span></div>
              <div><span class="k">Msgs (7d)</span><span class="v">${ch.count7d}</span></div>
            </div>
          </div>
        `).join("");

        const errs = (st.errors || []).slice(-5).reverse().map(e => `<li><code>${esc(e)}</code></li>`).join("") || `<li class="muted">No recent errors</li>`;

        const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Purrfect Universe — Bridge</title>
<meta http-equiv="refresh" content="30" />
<style>
:root{--bg:#0b0f14;--card:#0f141b;--muted:#8aa1b1;--text:#eaf2f8;--ok:#2ecc71;--warn:#f39c12;--bad:#e74c3c;--pill:#1f2a36;--accent:#6dc1ff;--border:#17202a;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif}
.wrapper{max-width:1100px;margin:0 auto;padding:28px}
.header{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:18px 0 8px 0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.k{display:block;color:var(--muted);font-size:12px}.v{display:block;font-size:18px;margin-top:2px}
.pill{background:var(--pill);padding:4px 8px;border-radius:999px}.muted{color:var(--muted)}
.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.badge{padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:#121a22}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
code{font-family:ui-monospace,Menlo,Monaco,Consolas,monospace}
ul{margin:8px 0 0 18px}hr{border:none;border-top:1px solid var(--border);margin:16px 0}
.top{display:grid;grid-template-columns:2fr 1fr;gap:12px}
form{display:grid;gap:8px;margin:10px 0}
input,textarea,select,button{font:inherit;border-radius:10px;border:1px solid var(--border);background:#121a22;color:var(--text);padding:8px}
button{cursor:pointer}
small.hint{color:var(--muted);display:block;margin-top:-4px}
label{font-size:12px;color:var(--muted)}
</style></head>
<body><div class="wrapper">
  <div class="header">
    <h1>🐾 Purrfect Bridge — Dashboard</h1>
    <span class="badge">${esc(st.tz)} • <span class="muted">${new Date().toLocaleString("en-GB",{hour12:false,timeZone:st.tz})}</span></span>
  </div>

  <div class="top">
    <div class="card">
      <h2>Runtime</h2>
      <div class="row">
        <div><span class="k">Bot</span><span class="v">${esc(st.botTag || "—")}</span></div>
        <div><span class="k">Status</span><span class="v ${st.ready ? "ok" : "bad"}">${st.ready ? "Online" : "Offline"}</span></div>
        <div><span class="k">Uptime</span><span class="v">${human(st.uptimeMs)}</span></div>
        <div><span class="k">Model</span><span class="v">${esc(st.model || "—")}</span></div>
      </div>
      <hr/>
      <div class="row">
        <div><span class="k">Daily Cron</span><span class="v">${esc(st.dailyCron || "—")}</span></div>
        <div><span class="k">Last Digest</span><span class="v">${st.lastDigestAt ? new Date(st.lastDigestAt).toLocaleString("en-GB",{hour12:false,timeZone:st.tz}) : "—"}</span></div>
        <div><span class="k">Autosummary</span><span class="v">${st.autosummary.enabled ? "Enabled" : "Disabled"}</span></div>
        <div><span class="k">Auto Config</span><span class="v">${esc(st.autosummary.cron || "—")} / ${st.autosummary.min} msgs / ${st.autosummary.lookback}h</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Allowlisted Channels</h2>
      <div class="grid">
        <div><span class="k">Count</span><span class="v">${st.channels.length}</span></div>
        <div><span class="k">Msgs (24h total)</span><span class="v">${st.channels.reduce((a,c)=>a+(c.count24h||0),0)}</span></div>
      </div>
      <hr/>
      <div><span class="k">IDs</span><span class="v muted">${esc(st.channels.map(c=>c.id).join(", ") || "—")}</span></div>
      <hr/>
      <div><span class="k">Canonical</span><span class="v">${esc(canonicalBaseUrl || "—")}</span></div>
    </div>
  </div>

  <h2>Channel Activity</h2>
  <div class="row">${rows || '<div class="muted">No channels</div>'}</div>

  <h2>Post from Dashboard</h2>
  <div class="card">
    <form method="post" action="/note">
      <label>Secret <small class="hint">Use your UNIVERSE_WEBHOOK_SECRET</small></label>
      <input name="secret" type="password" placeholder="••••••••"/>
      <label>Channel ID <small class="hint">Defaults to summary channel if empty</small></label>
      <input name="channelId" placeholder="${esc(defaultChannelId || "")}"/>
      <label>Section</label>
      <input name="section" placeholder="Manual Notes"/>
      <label>Text</label>
      <textarea name="text" rows="3" placeholder="What should be noted?"></textarea>
      <button type="submit">Post /note</button>
    </form>
    <hr/>
    <form method="post" action="/happening">
      <label>Secret</label>
      <input name="secret" type="password" placeholder="••••••••"/>
      <label>Section</label>
      <input name="section" placeholder="${esc(process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings")}"/>
      <label>Text</label>
      <textarea name="text" rows="3" placeholder="Key happening to surface in digests"></textarea>
      <button type="submit">Post /happening</button>
    </form>
    <hr/>
    <form method="post" action="/digest">
      <label>Secret</label>
      <input name="secret" type="password" placeholder="••••••••"/>
      <button type="submit">Trigger /digest now</button>
    </form>
  </div>

  <h2>Recent Errors</h2>
  <div class="card"><ul>${errs}</ul></div>

  <footer style="margin-top:22px" class="muted">
    Auto-refresh 30s • <a href="/health.json" class="muted">/health.json</a> • Canonical: ${esc(canonicalBaseUrl || "—")}
  </footer>
</div></body></html>`;

        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }

      // 404
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "not found" }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });

  server.listen(port, host, () => {
    console.log(`📊 Unified dashboard+webhook on http://${host}:${port}  (/, /health.json, /note, /happening, /digest)`);
    if (canonicalBaseUrl) {
      console.log(`🔗 Canonical: ${canonicalBaseUrl}`);
    }
  });

  return server;
}
