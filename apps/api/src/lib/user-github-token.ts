import { eq } from "drizzle-orm";
import { db, users, decryptSecret } from "@argo/db";

export async function getUserGithubToken(userId: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  return decryptSecret(user.githubAccessToken);
}
