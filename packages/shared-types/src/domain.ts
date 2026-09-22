import { z } from "zod";

export const domainStatusSchema = z.enum(["pending_dns", "provisioning", "active", "error", "removing"]);
export type DomainStatus = z.infer<typeof domainStatusSchema>;

export const domainSslStatusSchema = z.enum(["none", "provisioning", "active", "renewing", "error"]);
export type DomainSslStatus = z.infer<typeof domainSslStatusSchema>;

// RFC 1123 hostname: labels of letters/digits/hyphens (no leading/trailing
// hyphen), 1-63 chars each, joined by dots, at least two labels (a bare TLD
// isn't a domain anyone points at us).
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOSTNAME_LENGTH = 253;

export interface HostnameCheck {
  ok: boolean;
  error?: string;
  /** Lowercased, trimmed form to store/compare — only present when ok. */
  normalized?: string;
}

/**
 * Everything that has to be true about a string before it's worth a DNS
 * lookup: syntactically a real hostname, not an IP, not on our own domain
 * (that's what the free subdomain already is), not a bare "localhost"-style
 * single label. Pure and synchronous on purpose — the API validates shape
 * before it ever touches the network or the database.
 */
export function checkHostnameFormat(input: string, appDomain: string): HostnameCheck {
  const trimmed = input.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return { ok: false, error: "Enter a domain." };
  if (trimmed.length > MAX_HOSTNAME_LENGTH) return { ok: false, error: "That domain is too long." };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed) || trimmed.includes(":")) {
    return { ok: false, error: "Enter a domain name, not an IP address." };
  }
  if (trimmed.includes("*")) return { ok: false, error: "Wildcard domains aren't supported — add the exact hostname." };

  const labels = trimmed.split(".");
  if (labels.length < 2) return { ok: false, error: "Enter a full domain, like app.example.com." };
  if (!labels.every((l) => LABEL.test(l))) {
    return { ok: false, error: "That doesn't look like a valid domain name." };
  }

  const app = appDomain.toLowerCase().replace(/\.$/, "");
  if (trimmed === app || trimmed.endsWith(`.${app}`)) {
    return { ok: false, error: `Every project already gets a free *.${app} address — use your own domain here instead.` };
  }

  return { ok: true, normalized: trimmed };
}

/** An apex/root domain ("example.com", 2 labels) can't be a CNAME per DNS
 * rules — it needs an A record instead. A subdomain ("www.example.com")
 * can use either; we ask for a CNAME since it keeps working if the
 * server's IP ever changes. */
export function isApexDomain(hostname: string): boolean {
  return hostname.split(".").length === 2;
}

export interface DnsInstruction {
  type: "CNAME" | "A";
  host: string;
  value: string;
}

/** What to tell the user to put in their DNS, for the "pending_dns" state. */
export function dnsInstructionFor(hostname: string, appDomain: string, serverIp: string): DnsInstruction {
  return isApexDomain(hostname)
    ? { type: "A", host: "@", value: serverIp }
    : { type: "CNAME", host: hostname.split(".")[0]!, value: `${appDomain}.` };
}

export const createDomainInputSchema = z.object({ hostname: z.string().min(1).max(253) });
export type CreateDomainInput = z.infer<typeof createDomainInputSchema>;

export interface DomainDTO {
  id: string;
  projectId: string;
  hostname: string;
  status: DomainStatus;
  statusDetail: string | null;
  sslStatus: DomainSslStatus;
  sslStatusDetail: string | null;
  certExpiresAt: string | null;
  lastCheckedAt: string | null;
  dns: DnsInstruction;
  createdAt: string;
}

/** The free default address is always there and never stored as a row —
 * this is its live equivalent for the same UI. */
export interface DefaultDomainDTO {
  hostname: string;
  https: boolean;
  checkedAt: string | null;
}
