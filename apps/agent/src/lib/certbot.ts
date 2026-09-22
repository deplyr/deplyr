// Parsing for certbot's plain-text CLI output. Kept separate from the
// commands that shell out to certbot so the parsing itself is a pure,
// synchronous function that can be unit tested against captured real output
// — none of this needs Docker or the network to verify.

export interface ParsedCertificate {
  hostname: string;
  /** ISO 8601, or null if the line couldn't be parsed. */
  expiresAt: string | null;
  expired: boolean;
}

// A block per certificate, starting at "Certificate Name: X" and running
// until the next one (or the end of the listing).
const CERT_BLOCK = /Certificate Name:\s*(\S+)([\s\S]*?)(?=Certificate Name:\s*\S+|$)/g;
const EXPIRY_LINE = /Expiry Date:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\+00:00\s*(?:\(([A-Z]+))?/;

/**
 * Parses the block-per-certificate listing `certbot certificates` prints —
 * the same format `certonly` and `renew` echo a single certificate's worth
 * of, so all three call sites share this. Unmatched lines are simply
 * skipped, not an error: a future certbot output tweak should degrade to
 * "couldn't read the expiry" rather than throw.
 */
export function parseCertbotCertificates(output: string): ParsedCertificate[] {
  const results: ParsedCertificate[] = [];
  for (const match of output.matchAll(CERT_BLOCK)) {
    const hostname = match[1]!.trim();
    const block = match[2] ?? "";
    const expiryMatch = EXPIRY_LINE.exec(block);
    if (!expiryMatch) {
      results.push({ hostname, expiresAt: null, expired: false });
      continue;
    }
    // certbot prints this in UTC ("+00:00"); treat the captured wall-clock
    // value as UTC directly rather than re-parsing its "(VALID: N days)"
    // annotation, which is relative to whenever certbot ran, not to now.
    const iso = `${expiryMatch[1]!.replace(" ", "T")}Z`;
    const parsed = new Date(iso);
    results.push({
      hostname,
      expiresAt: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      expired: expiryMatch[2] === "EXPIRED" || (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()),
    });
  }
  return results;
}

/** Convenience for the single-domain case (after `certonly`/`renew` for one host). */
export function findCertificate(output: string, hostname: string): ParsedCertificate | undefined {
  return parseCertbotCertificates(output).find((c) => c.hostname === hostname);
}
