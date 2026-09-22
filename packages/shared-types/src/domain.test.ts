import { describe, expect, test } from "bun:test";
import { checkHostnameFormat, dnsInstructionFor, isApexDomain } from "./domain";

const APP = "deplyr.app";

describe("checkHostnameFormat", () => {
  test.each([
    "app.example.com",
    "example.com",
    "www.example.co.uk",
    "a-b.example.com",
    "x.io",
  ])("accepts %s", (h) => {
    const r = checkHostnameFormat(h, APP);
    expect(r.ok).toBe(true);
  });

  test("normalizes case, whitespace and a trailing dot", () => {
    const r = checkHostnameFormat("  Example.COM. ", APP);
    expect(r).toEqual({ ok: true, normalized: "example.com" });
  });

  test.each([
    ["", "empty"],
    ["   ", "blank"],
    ["localhost", "single label"],
    ["com", "bare TLD"],
    ["192.168.1.1", "IPv4"],
    ["::1", "IPv6"],
    ["*.example.com", "wildcard"],
    ["-bad.example.com", "leading hyphen label"],
    ["bad-.example.com", "trailing hyphen label"],
    ["exa mple.com", "space"],
    ["exa..mple.com", "empty label"],
    ["a".repeat(64) + ".com", "label over 63 chars"],
    ["a".repeat(260) + ".com", "hostname over 253 chars"],
  ])("rejects %s (%s)", (h) => {
    expect(checkHostnameFormat(h, APP).ok).toBe(false);
  });

  test.each(["deplyr.app", "DEPLYR.APP", "my-app.deplyr.app", "sub.my-app.deplyr.app"])(
    "rejects our own domain or a subdomain of it: %s",
    (h) => {
      const r = checkHostnameFormat(h, APP);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("free");
    },
  );

  test("a domain that merely CONTAINS the app domain as a substring (not a suffix) is fine", () => {
    // e.g. someone owns "notdeplyr.app.example.com" — must not be caught by a naive .includes()
    expect(checkHostnameFormat("notdeplyr.app.example.com", APP).ok).toBe(true);
  });
});

describe("isApexDomain", () => {
  test.each([
    ["example.com", true],
    ["www.example.com", false],
    ["a.b.example.com", false],
    ["x.io", true],
  ])("%s -> %p", (h, expected) => {
    expect(isApexDomain(h)).toBe(expected);
  });
});

describe("dnsInstructionFor", () => {
  test("apex domain gets an A record to the server IP", () => {
    expect(dnsInstructionFor("example.com", APP, "203.0.113.10")).toEqual({ type: "A", host: "@", value: "203.0.113.10" });
  });
  test("subdomain gets a CNAME to the app domain", () => {
    expect(dnsInstructionFor("www.example.com", APP, "203.0.113.10")).toEqual({ type: "CNAME", host: "www", value: "deplyr.app." });
  });
  test("a deeper subdomain uses only its first label as the CNAME host", () => {
    expect(dnsInstructionFor("api.staging.example.com", APP, "1.2.3.4").host).toBe("api");
  });
});
