import { describe, expect, test } from "bun:test";
import { findCertificate, parseCertbotCertificates } from "./certbot";

const SINGLE = `Saved the following certificates:
  Certificate Name: example.com
    Serial Number: 3d2b1a9c8e7f6d5c4b3a2918f7e6d5c4b3a2
    Key Type: ECDSA
    Domains: example.com
    Expiry Date: 2026-12-19 10:15:32+00:00 (VALID: 89 days)
    Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/example.com/privkey.pem
`;

const MULTIPLE = `Saved the following certificates:
  Certificate Name: example.com
    Serial Number: aaa111
    Key Type: ECDSA
    Domains: example.com
    Expiry Date: 2026-12-19 10:15:32+00:00 (VALID: 89 days)
    Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/example.com/privkey.pem
  Certificate Name: www.other-app.io
    Serial Number: bbb222
    Key Type: RSA
    Domains: www.other-app.io
    Expiry Date: 2026-09-25 00:00:00+00:00 (VALID: 3 days)
    Certificate Path: /etc/letsencrypt/live/www.other-app.io/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/www.other-app.io/privkey.pem
`;

const EXPIRED = `Saved the following certificates:
  Certificate Name: stale.example.com
    Serial Number: ccc333
    Key Type: ECDSA
    Domains: stale.example.com
    Expiry Date: 2020-01-01 00:00:00+00:00 (INVALID: EXPIRED)
    Certificate Path: /etc/letsencrypt/live/stale.example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/stale.example.com/privkey.pem
`;

const EMPTY = "No certificates found.\n";

describe("parseCertbotCertificates", () => {
  test("parses a single certificate", () => {
    const r = parseCertbotCertificates(SINGLE);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ hostname: "example.com", expiresAt: "2026-12-19T10:15:32.000Z", expired: false });
  });

  test("parses multiple certificates in one listing, in order", () => {
    const r = parseCertbotCertificates(MULTIPLE);
    expect(r.map((c) => c.hostname)).toEqual(["example.com", "www.other-app.io"]);
    expect(r[1]!.expiresAt).toBe("2026-09-25T00:00:00.000Z");
  });

  test("flags a certbot-reported EXPIRED certificate", () => {
    const r = parseCertbotCertificates(EXPIRED);
    expect(r[0]!.expired).toBe(true);
    expect(r[0]!.expiresAt).toBe("2020-01-01T00:00:00.000Z");
  });

  test("a date in the past is flagged expired even without the (VALID:...) annotation", () => {
    const noAnnotation = SINGLE.replace("(VALID: 89 days)", "").replace("2026-12-19", "2000-01-01");
    const r = parseCertbotCertificates(noAnnotation);
    expect(r[0]!.expired).toBe(true);
  });

  test("no certificates -> empty array, not an error", () => {
    expect(parseCertbotCertificates(EMPTY)).toEqual([]);
  });

  test("garbage input -> empty array", () => {
    expect(parseCertbotCertificates("docker: command not found\n")).toEqual([]);
  });

  test("a certificate with no parseable expiry line still comes back, with expiresAt null", () => {
    const broken = "Certificate Name: broken.example.com\n  Domains: broken.example.com\n";
    const r = parseCertbotCertificates(broken);
    expect(r).toEqual([{ hostname: "broken.example.com", expiresAt: null, expired: false }]);
  });
});

describe("findCertificate", () => {
  test("finds the matching certificate by exact hostname", () => {
    expect(findCertificate(MULTIPLE, "www.other-app.io")?.expiresAt).toBe("2026-09-25T00:00:00.000Z");
  });
  test("returns undefined for a hostname not in the output", () => {
    expect(findCertificate(MULTIPLE, "nope.example.com")).toBeUndefined();
  });
});
