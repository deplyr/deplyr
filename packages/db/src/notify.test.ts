import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deliverWebhook } from "./notify";

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler = () => new Response(null, { status: 204 });
let redirectTargetHits = 0;
const received: unknown[] = [];

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/internal-target") {
      redirectTargetHits++;
      return new Response("you should never see this");
    }
    if (req.method === "POST") received.push(await req.clone().json().catch(() => null));
    return handler(req);
  },
});
const URL_ = `http://127.0.0.1:${server.port}/hook/secret-token-123`;
afterAll(() => server.stop(true));

const msg = { level: "critical" as const, title: "my-app went down", message: "Health check failed" };
const sleeps: number[] = [];
const sleep = async (ms: number) => void sleeps.push(ms);
const fresh = () => {
  sleeps.length = 0;
  received.length = 0;
};

describe("payloads reach the service", () => {
  test("Discord gets an embed and a 204 is success", async () => {
    fresh();
    handler = () => new Response(null, { status: 204 });
    const r = await deliverWebhook("discord", URL_, msg, { sleep });
    expect(r).toEqual({ ok: true, error: null, attempts: 1 });
    expect((received[0] as { embeds: { title: string }[] }).embeds[0]!.title).toBe("my-app went down");
  });
  test("Slack gets blocks", async () => {
    fresh();
    handler = () => new Response("ok", { status: 200 });
    const r = await deliverWebhook("slack", URL_, msg, { sleep });
    expect(r.ok).toBe(true);
    expect((received[0] as { attachments: unknown[] }).attachments.length).toBe(1);
  });
});

describe("retries", () => {
  test("429 with Retry-After waits that long, then succeeds", async () => {
    fresh();
    let n = 0;
    handler = () => (n++ === 0 ? new Response("slow down", { status: 429, headers: { "retry-after": "2" } }) : new Response(null, { status: 204 }));
    const r = await deliverWebhook("discord", URL_, msg, { sleep });
    expect(r).toEqual({ ok: true, error: null, attempts: 2 });
    expect(sleeps).toEqual([2000]);
  });
  test("Discord's JSON retry_after (seconds, fractional) is honoured", async () => {
    fresh();
    let n = 0;
    handler = () => (n++ === 0 ? new Response(JSON.stringify({ retry_after: 0.5 }), { status: 429 }) : new Response(null, { status: 204 }));
    await deliverWebhook("discord", URL_, msg, { sleep });
    expect(sleeps).toEqual([500]);
  });
  test("a huge Retry-After is capped so a job can't hang", async () => {
    fresh();
    let n = 0;
    handler = () => (n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "3600" } }) : new Response(null, { status: 204 }));
    await deliverWebhook("slack", URL_, msg, { sleep });
    expect(sleeps).toEqual([5000]);
  });
  test("a 5xx is retried once and can recover", async () => {
    fresh();
    let n = 0;
    handler = () => (n++ === 0 ? new Response("boom", { status: 503 }) : new Response(null, { status: 204 }));
    expect(await deliverWebhook("discord", URL_, msg, { sleep })).toEqual({ ok: true, error: null, attempts: 2 });
  });
  test("two 5xx in a row fail, after exactly two attempts", async () => {
    fresh();
    let hits = 0;
    handler = () => (hits++, new Response("boom", { status: 502 }));
    const r = await deliverWebhook("discord", URL_, msg, { sleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
    expect(hits).toBe(2);
    expect(r.error).toContain("502");
  });
});

describe("failures that won't heal are not retried, and are explained", () => {
  test.each([
    [404, "Unknown Webhook", "no longer exists"],
    [404, "no_service", "no longer exists"],
    [403, "", "revoked"],
    [401, "", "revoked"],
    [400, "invalid_payload", "malformed"],
  ])("HTTP %i (%s)", async (status, body, phrase) => {
    fresh();
    let hits = 0;
    handler = () => (hits++, new Response(body, { status }));
    const r = await deliverWebhook("slack", URL_, msg, { sleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
    expect(hits).toBe(1);
    expect(r.error).toContain(phrase);
  });
});

describe("safety", () => {
  test("a redirect is not followed and is reported", async () => {
    fresh();
    redirectTargetHits = 0;
    handler = () => new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${server.port}/internal-target` } });
    const r = await deliverWebhook("discord", URL_, msg, { sleep });
    expect(r.ok).toBe(false);
    expect(redirectTargetHits).toBe(0);
    expect(r.error).toContain("redirected");
  });
  test("a slow service times out instead of hanging", async () => {
    fresh();
    handler = () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(null, { status: 204 })), 1500));
    const r = await deliverWebhook("discord", URL_, msg, { sleep, timeoutMs: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("in time");
    expect(r.attempts).toBe(2);
  });
  test("an unreachable host fails cleanly", async () => {
    fresh();
    const r = await deliverWebhook("discord", "http://127.0.0.1:1/x/secret-token-123", msg, { sleep, timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("reach");
  });
  test("no error message ever contains the webhook URL or its token, even if the service echoes it", async () => {
    for (const status of [400, 403, 404, 500, 302, 418]) {
      fresh();
      handler = () => new Response(`bad request for ${URL_} (token secret-token-123)`, { status });
      const r = await deliverWebhook("discord", URL_, msg, { sleep });
      expect(r.ok).toBe(false);
      expect(r.error ?? "").not.toContain(URL_);
      expect(r.error ?? "").not.toContain("http://127.0.0.1");
    }
  });
});
