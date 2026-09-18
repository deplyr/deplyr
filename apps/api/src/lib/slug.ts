import { eq, like } from "drizzle-orm";
import { db, projects } from "@argo/db";

function baseSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "app";
}

/** Appends a short random suffix on collision — stored value is the slug
 * alone (e.g. "my-app"), not the full hostname; see project.ts's
 * ProjectSummary for why. */
export async function uniqueProjectSlug(name: string): Promise<string> {
  const slug = baseSlug(name);

  const [exact] = await db.select().from(projects).where(eq(projects.subdomain, slug));
  if (!exact) return slug;

  const taken = await db
    .select({ subdomain: projects.subdomain })
    .from(projects)
    .where(like(projects.subdomain, `${slug}-%`));
  const takenSet = new Set(taken.map((t) => t.subdomain));

  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${slug}-${suffix}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  throw new Error("could not generate a unique subdomain");
}
