import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://argo:argo@localhost:5432/argo";

const migrationClient = postgres(connectionString, { max: 1 });

await migrate(drizzle(migrationClient), { migrationsFolder: "./migrations" });
await migrationClient.end();

console.log("Migrations applied.");
