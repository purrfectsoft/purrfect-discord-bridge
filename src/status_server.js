// src/status_server.js
import http from "http";

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

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function startStatusServer({ port = 3000, getState }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/health.json") {
        const state = await getState();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({
          ok: true,
          ...state,
          nowISO: new Date().toISOString()
        }));
      }

      // default: render HTML dashboard
      const st = await getState();

      const rows = st.channels.map(ch => {
        return `
          <div class="card">
            <div class="card-head">
              <span class="pill">#${escapeHtml(ch.name || ch.id)}</span>
              <span class="muted">${ch.id}</span>
            </div>
            <div class="grid">
              <div><span class="k">Msgs (24h)</span><span class="v">${ch.count24h}</span></div>
              <div><span class="k">Msgs (7d)</span><span class="v">${ch.count7d}</span></div>
            </div>
          </div>
        `;
      }).join("");

      const errs = (st.errors || []).slice(-5).reverse().map(e => `
        <li><code>${escapeHtml(e)}</code></li>
      `).join("") || `<li class="muted">No recent errors</li>`;

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="30" />
<title>Purrfect Universe — Bot Status</title>
<style>
:root{
  --bg:#0b0f14; --card:#0f141b; --muted:#8aa1b1; --text:#eaf2f8; --ok:#2ecc71; --warn:#f39c12; --bad:#e74c3c; --pill:#1f2a36; --accent:#6dc1ff;
  --border:#17202a;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif}
.wrapper{max-width:1100px;margin:0 auto;padding:28px}
.header{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:20px;margin:0}
h2{font-size:16px;margin:18px 0 8px 0}
.grid{display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:10px}
.k{display:block;color:var(--muted);font-size:12px}
.v{display:block;font-size:18px;margin-top:2px}
.pill{background:var(--pill);padding:4px 8px;border-radius:999px}
.muted{color:var(--muted)}
.row{display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.badge{padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:#121a22}
.ok{color:var(--ok)}
.warn{color:var(--warn)}
.bad{color:var(--bad)}
footer{margin-top:22px;color:var(--muted);font-size:12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
ul{margin:8px 0 0 18px}
hr{border:none;border-top:1px solid var(--border);margin:16px 0}
.top{display:grid;grid-template-columns:2fr 1fr;gap:12px}
</style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🐾 Purrfect Universe — Bot Status</h1>
      <span class="badge">${escapeHtml(st.tz)} • <span class="muted">${new Date().toLocaleString("en-GB",{hour12:false,timeZone:st.tz})}</span></span>
    </div>

    <div class="top">
      <div class="card">
        <h2>Runtime</h2>
        <div class="row">
          <div><span class="k">Bot</span><span class="v">${escapeHtml(st.botTag || "—")}</span></div>
          <div><span class="k">Status</span><span class="v ${st.ready ? "ok" : "bad"}">${st.ready ? "Online" : "Offline"}</span></div>
          <div><span class="k">Uptime</span><span class="v">${human(st.uptimeMs)}</span></div>
          <div><span class="k">OpenAI Model</span><span class="v">${escapeHtml(st.model || "—")}</span></div>
        </div>
        <hr/>
        <div class="row">
          <div><span class="k">Daily Cron</span><span class="v">${escapeHtml(st.dailyCron || "—")}</span></div>
          <div><span class="k">Last Digest</span><span class="v">${st.lastDigestAt ? new Date(st.lastDigestAt).toLocaleString("en-GB",{hour12:false,timeZone:st.tz}) : "—"}</span></div>
          <div><span class="k">Autosummary</span><span class="v">${st.autosummary.enabled ? "Enabled" : "Disabled"}</span></div>
          <div><span class="k">Auto Config</span><span class="v">${escapeHtml(st.autosummary.cron || "—")} / ${st.autosummary.min} msgs / ${st.autosummary.lookback}h</span></div>
        </div>
      </div>

      <div class="card">
        <h2>Allowlisted Channels</h2>
        <div class="grid">
          <div><span class="k">Count</span><span class="v">${st.channels.length}</span></div>
          <div><span class="k">Messages (24h total)</span><span class="v">${st.channels.reduce((a,c)=>a+(c.count24h||0),0)}</span></div>
        </div>
        <hr/>
        <div><span class="k">IDs</span><span class="v muted">${escapeHtml(st.channels.map(c=>c.id).join(", ") || "—")}</span></div>
      </div>
    </div>

    <h2>Channel Activity</h2>
    <div class="row">
      ${rows || '<div class="muted">No channels</div>'}
    </div>

    <h2>Recent Errors</h2>
    <div class="card">
      <ul>${errs}</ul>
    </div>

    <footer>
      Auto-refreshes every 30s • <a href="/health.json" class="muted">/health.json</a>
    </footer>
  </div>
</body>
</html>`;

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end("Status server error: " + e.message);
    }
  });

  server.listen(port, () => {
    console.log(`📊 Status dashboard on http://localhost:${port}  (and /health.json)`);
  });
  return server;
}
