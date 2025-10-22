import test from "node:test";
import assert from "node:assert/strict";

import { render_dashboard, render_runtime_card, render_channel_grid, render_forms } from "../../src/dashboard/render_dashboard.js";

test("render_runtime_card includes Tailwind classes", () => {
  const html = render_runtime_card({
    botTag: "PurrBot#1234",
    ready: true,
    uptimeMs: 123456,
    model: "gpt-5-codex",
    dailyCron: "0 9 * * *",
    lastDigestAt: "2024-01-01T12:00:00.000Z",
    autosummary: { enabled: true, cron: "*/15 * * * *", min: 5, lookback: 3 },
    tz: "UTC"
  });
  assert.ok(html.includes("bg-slate-900/80"));
  assert.ok(html.includes("text-brand-emerald-400"));
});

test("render_channel_grid handles channels", () => {
  const html = render_channel_grid([
    { id: "123", name: "general", count24h: 10, count7d: 70 },
    { id: "456", name: "random", count24h: 5, count7d: 30 }
  ]);
  assert.ok(html.includes("grid grid-cols-1"));
  assert.ok(html.includes("#general"));
  assert.ok(html.includes("Msgs (7d)"));
});

test("render_forms injects defaults", () => {
  const html = render_forms({ defaultChannelId: "789" });
  assert.ok(html.includes("id=\"forms\""));
  assert.ok(html.includes("placeholder=\"789\""));
  assert.ok(html.includes("bg-slate-900/80"));
});

test("render_dashboard composes sections", () => {
  const sample = {
    botTag: "PurrBot#1234",
    ready: false,
    uptimeMs: 98765,
    model: "gpt-5-codex",
    dailyCron: "0 9 * * *",
    lastDigestAt: "2024-01-02T12:00:00.000Z",
    autosummary: { enabled: false, cron: "0 * * * *", min: 10, lookback: 6 },
    tz: "UTC",
    channels: [
      { id: "111", name: "alpha", count24h: 1, count7d: 10 }
    ],
    errors: ["Boom", "Kapow"]
  };
  const html = render_dashboard(sample, { canonicalBaseUrl: "https://example.com", defaultChannelId: "999" });
  assert.ok(html.includes("cdn.tailwindcss.com?plugins=forms,typography"));
  assert.ok(html.includes("tailwind.config"));
  assert.ok(html.includes("Channel Activity"));
  assert.ok(html.includes("Recent Errors"));
  assert.ok(html.includes("Boom"));
  assert.ok(html.includes("https://example.com"));
});
