/**
 * Extracts declared keys from a .env.example file's contents — ignores
 * comments, blank lines, and the placeholder values themselves (only the
 * key names matter for building the secrets form).
 */
export function parseEnvExampleKeys(content: string): string[] {
  const keys: string[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) keys.push(match[1]);
  }
  return [...new Set(keys)];
}
