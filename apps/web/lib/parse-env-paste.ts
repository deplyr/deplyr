export interface ParsedEnvVar {
  key: string;
  value: string;
}

/**
 * Parses a pasted .env-style block (KEY=VALUE per line) for bulk import —
 * the paste-a-.env-file flow Vercel and friends have. More permissive than
 * parse-env-example.ts on the API side: that one only cares about key
 * names (from a repo's .env.example, values are placeholders), this one
 * needs the actual values a person just pasted from their terminal or
 * password manager.
 */
export function parseEnvPaste(content: string): ParsedEnvVar[] {
  const result: ParsedEnvVar[] = [];
  const indexByKey = new Map<string, number>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();

    // Strip matching surrounding quotes; unescape \n and \" for double-quoted
    // values only (dotenv convention — single-quoted stays literal).
    if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    // Last occurrence of a repeated key wins, same as a shell sourcing the file.
    const existing = indexByKey.get(key);
    if (existing !== undefined) result[existing] = { key, value };
    else {
      indexByKey.set(key, result.length);
      result.push({ key, value });
    }
  }

  return result;
}
