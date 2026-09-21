import { describe, expect, test } from "bun:test";
import {
  createChannelInputSchema,
  escapeSlack,
  formatDiscord,
  formatSlack,
  isValidWebhookUrl,
  webhookHint,
} from "./notification";

const SLACK = "https://hooks.slack.com/services/T01ABCDEF/B02GHIJKL/abcDEF123456xyz";
const DISCORD = "https://discord.com/api/webhooks/1234567890123456789/abc-DEF_123.xyz";

describe("webhook URL validation", () => {
  test.each([
    ["slack", SLACK, true],
    ["discord", DISCORD, true],
    ["discord", "https://discordapp.com/api/webhooks/123/abc", true],
    ["discord", "https://ptb.discord.com/api/webhooks/123/abc", true],
    ["discord", `${DISCORD}?thread_id=99`, true],
    ["slack", "http://hooks.slack.com/services/T1/B2/c3", false], // not https
    ["slack", "https://hooks.slack.com.evil.com/services/T1/B2/c3", false], // lookalike host
    ["slack", "https://evil.com/https://hooks.slack.com/services/T1/B2/c3", false],
    ["slack", DISCORD, false], // right shape, wrong service
    ["discord", SLACK, false],
    ["discord", "https://discord.com/api/webhooks/notanumber/abc", false],
    ["discord", "https://discord.com.evil.com/api/webhooks/123/abc", false],
    ["discord", "https://localhost:4000/api/webhooks/123/abc", false],
    ["slack", "https://127.0.0.1/services/T1/B2/c3", false],
    ["slack", "https://hooks.slack.com/services/T1/B2/c3 ", false], // trailing space is not trusted here
    ["slack", "", false],
  ])("%s %s -> %p", (type, url, ok) => {
    expect(isValidWebhookUrl(type as "slack" | "discord", url)).toBe(ok);
  });

  test("the hint is only the last few characters, and ignores any query string", () => {
    expect(webhookHint(DISCORD)).toBe("…3.xyz");
    expect(webhookHint(`${DISCORD}?thread_id=1`)).toBe("…3.xyz");
    expect(webhookHint(DISCORD).length).toBeLessThan(DISCORD.length / 8);
  });
});

describe("create channel schema", () => {
  const base = { type: "discord" as const, name: "Team alerts", webhookUrl: DISCORD, events: ["app.down" as const] };
  test("accepts a valid channel", () => expect(createChannelInputSchema.safeParse(base).success).toBe(true));
  test("trims the name and URL", () => {
    const r = createChannelInputSchema.safeParse({ ...base, name: "  x  ", webhookUrl: `  ${DISCORD}  ` });
    expect(r.success && r.data.name).toBe("x");
  });
  test("rejects a URL for the wrong service with a helpful message", () => {
    const r = createChannelInputSchema.safeParse({ ...base, webhookUrl: SLACK });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("Discord webhook");
  });
  test("needs at least one event", () => expect(createChannelInputSchema.safeParse({ ...base, events: [] }).success).toBe(false));
  test("rejects unknown events", () => expect(createChannelInputSchema.safeParse({ ...base, events: ["app.exploded"] }).success).toBe(false));
  test("rejects an empty name", () => expect(createChannelInputSchema.safeParse({ ...base, name: "   " }).success).toBe(false));
});

describe("Discord payload", () => {
  const msg = { level: "critical" as const, title: "my-app went down", message: "Health check failed", fields: [{ name: "Server", value: "demo-vps" }], url: "https://app.example/projects/1" };
  test("has the embed shape Discord expects", () => {
    const p = formatDiscord(msg);
    expect(p.embeds[0]).toMatchObject({ title: "my-app went down", description: "Health check failed", url: "https://app.example/projects/1", color: 0xf87171 });
    expect(p.embeds[0]!.fields[0]).toEqual({ name: "Server", value: "demo-vps", inline: true });
  });
  test("respects Discord's limits", () => {
    const p = formatDiscord({ level: "info", title: "t".repeat(500), message: "m".repeat(9000), fields: Array.from({ length: 40 }, (_, i) => ({ name: `n${i}`, value: "v".repeat(2000) })) });
    const e = p.embeds[0]!;
    expect(e.title.length).toBeLessThanOrEqual(256);
    expect(e.description.length).toBeLessThanOrEqual(4096);
    expect(e.fields.length).toBe(25);
    expect(e.fields.every((f) => f.value.length <= 1024)).toBe(true);
  });
  test("empty field values don't produce an invalid embed (Discord rejects empty strings)", () => {
    const f = formatDiscord({ level: "info", title: "t", message: "m", fields: [{ name: "", value: "" }] }).embeds[0]!.fields[0]!;
    expect(f.name).toBe("—");
    expect(f.value).toBe("—");
  });
  test.each([["critical", 0xf87171], ["success", 0x34d399], ["info", 0x22d3ee]] as const)("%s colour", (level, colour) => {
    expect(formatDiscord({ level, title: "t", message: "m" }).embeds[0]!.color).toBe(colour);
  });
});

describe("Slack payload", () => {
  test("escapes control characters so user-controlled names can't inject markup or links", () => {
    expect(escapeSlack("<!channel> & <http://evil|click>")).toBe("&lt;!channel&gt; &amp; &lt;http://evil|click&gt;");
    const p = formatSlack({ level: "critical", title: "<!here> down", message: "a & b" });
    const text = JSON.stringify(p);
    expect(text).not.toContain("<!here>");
    expect(text).toContain("&lt;!here&gt;");
  });
  test("has a plain-text fallback and a coloured attachment", () => {
    const p = formatSlack({ level: "success", title: "Deployed my-app", message: "ok" });
    expect(p.text).toBe("🟢 Deployed my-app");
    expect(p.attachments[0]!.color).toBe("#34D399");
  });
  test("link goes in the footer only when there is one", () => {
    expect(JSON.stringify(formatSlack({ level: "info", title: "t", message: "m", url: "https://x.test/p" }))).toContain("<https://x.test/p|Open in Deplyr>");
    expect(JSON.stringify(formatSlack({ level: "info", title: "t", message: "m" }))).not.toContain("Open in Deplyr");
  });
  test("caps the section length", () => {
    const p = formatSlack({ level: "info", title: "t", message: "m".repeat(9000) });
    expect((p.attachments[0]!.blocks[0] as { text: { text: string } }).text.text.length).toBeLessThanOrEqual(3000);
  });
});
