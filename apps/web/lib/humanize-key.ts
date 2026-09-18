const ACRONYMS = new Set([
  "URL",
  "URI",
  "API",
  "ID",
  "DB",
  "SSL",
  "TLS",
  "AWS",
  "S3",
  "SMTP",
  "DSN",
  "JWT",
  "SMS",
  "IP",
  "DNS",
  "CDN",
  "GCP",
  "SQL",
  "JSON",
  "XML",
  "HTML",
  "CSS",
  "UI",
  "UX",
  "CLI",
]);

/** Best-effort human label from an env var name, e.g. "DATABASE_URL" -> "Database URL". */
export function humanizeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ");
}
