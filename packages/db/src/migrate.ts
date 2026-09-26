import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://argo:argo@localhost:5432/argo";

const migrationClient = postgres(connectionString, { max: 1 });

// Resolved from this file's own location, not process.cwd() — "./migrations"
// only worked when invoked from packages/db itself (`bun run db:migrate`
// locally); running it from the api image's CMD (cwd /app) needed this to
// still find packages/db/migrations regardless.
const migrationsFolder = new URL("../migrations", import.meta.url).pathname;

await migrate(drizzle(migrationClient), { migrationsFolder });
await migrationClient.end();

console.log("Migrations applied.");
