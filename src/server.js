// src/server.js
import http from "http";
import { URL } from "url";

import render_dashboard from "./dashboard/render_dashboard.js";

async function parseBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8");
  const ctype = (req.headers["content-type"] || "").toLowerCase();

  if (ctype.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  // allow empty / unknown content-types for simple form submits
  if (!ctype) return {};
  return {};
}

/**
 * startServer
 * Single-port HTTP server for:
 *   - GET  /             -> HTML dashboard (with forms)
 *   - GET  /health.json  -> JSON health/status
 *   - POST /note         -> add a manual note (form or JSON)
 *   - POST /happening    -> add a "Key Happening" (form or JSON)
 *   - POST /digest       -> trigger a digest
 *
 * Options:
 *  - port, host
 *  - canonicalBaseUrl (string)
 *  - secret (UNIVERSE_WEBHOOK_SECRET)
 *  - onNote (fn), onHappening (optional fn), onDigest (fn)
 *  - isAllowedChannel (fn), defaultChannelId (string)
 *  - getState (async fn => dashboard data)
 */
export function startServer({
  port = 3000,
  host = "127.0.0.1",
  canonicalBaseUrl = "",
  secret,
  onNote,
  onHappening,          // optional
  onDigest,
  isAllowedChannel,
  defaultChannelId,
  getState
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

      // POST: /note
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
        // Redirect for browser forms; JSON for API clients
        if ((req.headers["accept"] || "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(303, { Location: "/" });
        return res.end();
      }

      // POST: /happening
      if (req.method === "POST" && url.pathname === "/happening") {
        const body = await parseBody(req);
        const provided = req.headers["x-universe-secret"] || body.secret;
        if (!secret || provided !== secret) {
          res.writeHead(401, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        }
        const { text, section, author, authorId, timestampISO, channelId } = body || {};
        if (!text || typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "missing text" }));
        }
        // Prefer dedicated handler if provided, else record it as a note under Key Happenings.
        if (typeof onHappening === "function") {
          await onHappening({ text, section, author, authorId, timestampISO, channelId });
        } else {
          await onNote({
            text,
            section: section || (process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings"),
            channelId: channelId || defaultChannelId,
            author: author || "Dashboard",
            authorId: authorId || "dashboard",
            timestampISO: timestampISO || new Date().toISOString()
          });
        }
        if ((req.headers["accept"] || "").includes("application/json")) {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(303, { Location: "/" });
        return res.end();
      }

      // POST: /digest
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

      // GET: Dashboard HTML with controls (no meta refresh; JS-driven pauseable refresh)
      if (req.method === "GET" && url.pathname === "/") {
        const st = await getState();
        const html = render_dashboard(st, { canonicalBaseUrl, defaultChannelId });

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
