import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import renderDashboard, { render_metrics } from "./dashboard/render_dashboard.js";
import type { ServerHooks } from "./types.js";

type HxVariant = "success" | "error" | "info";

type ParsedBody = Record<string, unknown>;

function escapeHtml(str: unknown = ""): string {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isHxRequest(req: IncomingMessage): boolean {
  return (req.headers["hx-request"] || "").toString().toLowerCase() === "true";
}

function hxSnippet(message: string, { variant = "info" }: { variant?: HxVariant } = {}): string {
  const palette: Record<HxVariant, { border: string; bg: string; text: string }> = {
    success: {
      border: "border-emerald-500",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
    },
    error: {
      border: "border-rose-500",
      bg: "bg-rose-500/10",
      text: "text-rose-200",
    },
    info: {
      border: "border-slate-600",
      bg: "bg-slate-700/30",
      text: "text-slate-200",
    },
  };
  const colors = palette[variant] || palette.info;
  return `<div class="rounded-xl border ${colors.border} ${colors.bg} px-4 py-3 text-sm ${colors.text}">${escapeHtml(message)}</div>`;
}

function sendHx(res: ServerResponse, status: number, message: string, variant: HxVariant): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(hxSnippet(message, { variant }));
}

async function parseBody(req: IncomingMessage): Promise<ParsedBody> {
  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(Buffer.from(ch));
  const raw = Buffer.concat(chunks).toString("utf8");
  const ctype = (req.headers["content-type"] || "").toString().toLowerCase();

  if (ctype.includes("application/json")) {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj: ParsedBody = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  if (!ctype) return {};
  return {};
}

export function startServer({
  port = 3000,
  host = "127.0.0.1",
  canonicalBaseUrl = "",
  secret,
  onNote,
  onHappening,
  onDigest,
  isAllowedChannel,
  defaultChannelId,
  getState,
}: ServerHooks): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "missing url" }));
      }
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/health.json") {
        const st = await getState();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, nowISO: new Date().toISOString(), ...st }));
      }

      if (req.method === "GET" && url.pathname === "/metrics") {
        const st = await getState();
        const html = render_metrics(st, { canonicalBaseUrl });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }

      if (req.method === "POST" && url.pathname === "/note") {
        const body = await parseBody(req);
        const hx = isHxRequest(req);
        const wantsJson = (req.headers["accept"] || "").toString().includes("application/json");
        const provided = (req.headers["x-universe-secret"] || body.secret || "").toString();
        if (!secret || provided !== secret) {
          if (hx) {
            sendHx(res, 200, "Unauthorized — check your secret.", "error");
            return;
          }
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        const { text, section, channelId, author, authorId, timestampISO } = body;
        if (typeof text !== "string" || !text.trim()) {
          if (hx) {
            sendHx(res, 200, "Text is required to post a note.", "error");
            return;
          }
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "missing text" }));
          return;
        }
        const chId = typeof channelId === "string" && channelId.trim() ? channelId.trim() : defaultChannelId;
        if (!chId || !isAllowedChannel(chId)) {
          if (hx) {
            sendHx(res, 200, "Channel is missing or not allowlisted.", "error");
            return;
          }
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid or not-allowlisted channelId" }));
          return;
        }
        await Promise.resolve(
          onNote({
            text,
            section: typeof section === "string" && section.trim() ? section : "Manual Notes",
            channelId: chId,
            author: typeof author === "string" && author.trim() ? author : "Dashboard",
            authorId: typeof authorId === "string" && authorId.trim() ? authorId : "dashboard",
            timestampISO: typeof timestampISO === "string" && timestampISO.trim() ? timestampISO : new Date().toISOString(),
          }),
        );
        if (wantsJson) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (hx) {
          sendHx(res, 200, `Note posted to ${chId}.`, "success");
          return;
        }
        res.writeHead(303, { Location: "/" });
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/happening") {
        const body = await parseBody(req);
        const hx = isHxRequest(req);
        const wantsJson = (req.headers["accept"] || "").toString().includes("application/json");
        const provided = (req.headers["x-universe-secret"] || body.secret || "").toString();
        if (!secret || provided !== secret) {
          if (hx) {
            sendHx(res, 200, "Unauthorized — check your secret.", "error");
            return;
          }
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        const { text, section, author, authorId, timestampISO, channelId } = body;
        if (typeof text !== "string" || !text.trim()) {
          if (hx) {
            sendHx(res, 200, "Text is required to record a happening.", "error");
            return;
          }
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "missing text" }));
          return;
        }
        if (typeof onHappening === "function") {
          await Promise.resolve(
            onHappening({
              text,
              section: typeof section === "string" ? section : undefined,
              author: typeof author === "string" ? author : undefined,
              authorId: typeof authorId === "string" ? authorId : undefined,
              timestampISO: typeof timestampISO === "string" ? timestampISO : undefined,
              channelId: typeof channelId === "string" ? channelId : undefined,
            }),
          );
        } else {
          await Promise.resolve(
            onNote({
              text,
              section:
                typeof section === "string" && section.trim()
                  ? section
                  : process.env.KEYHAPPENINGS_SECTION_NAME || "Key Happenings",
              channelId: (typeof channelId === "string" && channelId.trim()) || defaultChannelId || null,
              author: typeof author === "string" && author.trim() ? author : "Dashboard",
              authorId: typeof authorId === "string" && authorId.trim() ? authorId : "dashboard",
              timestampISO: typeof timestampISO === "string" && timestampISO.trim() ? timestampISO : new Date().toISOString(),
            }),
          );
        }
        if (wantsJson) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (hx) {
          sendHx(res, 200, "Happening recorded.", "success");
          return;
        }
        res.writeHead(303, { Location: "/" });
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/digest") {
        const body = await parseBody(req);
        const hx = isHxRequest(req);
        const wantsJson = (req.headers["accept"] || "").toString().includes("application/json");
        const provided = (req.headers["x-universe-secret"] || body.secret || "").toString();
        if (!secret || provided !== secret) {
          if (hx) {
            sendHx(res, 200, "Unauthorized — check your secret.", "error");
            return;
          }
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        await Promise.resolve(onDigest());
        if (wantsJson) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (hx) {
          sendHx(res, 200, "Digest run triggered.", "success");
          return;
        }
        res.writeHead(303, { Location: "/" });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/") {
        const st = await getState();
        const html = renderDashboard(st, { canonicalBaseUrl, defaultChannelId });

        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
    } catch (error) {
      const err = error as Error;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
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
