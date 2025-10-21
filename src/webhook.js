// src/webhook.js
import http from "http";
import { addHappening } from "./happenings.js";

/**
 * Minimal HTTP server for programmatic interactions:
 *   POST /note       -> add a manual note via onNote callback
 *   POST /happening  -> add a sanitized "Key Happening" (stored locally)
 *   POST /digest     -> trigger runDigestOnce via onDigest callback
 *
 * Auth: set UNIVERSE_WEBHOOK_SECRET and send it in header: x-universe-secret
 */
export function startWebhookServer({
  port,
  secret,
  onNote,             // async ({ text, section, channelId, author, authorId, timestampISO })
  onDigest,           // async () => void
  isAllowedChannel,   // (id) => boolean
  defaultChannelId
}) {
  const server = http.createServer(async (req, res) => {
    try {
      // --- auth ---
      const provided = req.headers["x-universe-secret"];
      if (!secret || provided !== secret) {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      }

      // --- parse body (JSON only) ---
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }

      // --- routes ---
      if (req.method === "POST" && req.url === "/note") {
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
          author: author || "Webhook",
          authorId: authorId || "webhook",
          timestampISO: timestampISO || new Date().toISOString()
        });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (req.method === "POST" && req.url === "/happening") {
        const { text, author, source, channelId, section } = body || {};
        if (!text || typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "missing text" }));
        }
        addHappening({ text, author, source, channelId, section });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (req.method === "POST" && req.url === "/digest") {
        await onDigest();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });

  server.listen(port, () => {
    console.log(`🌐 Webhook listening on http://localhost:${port}  (POST /note, /happening, /digest)`);
  });

  return server;
}
