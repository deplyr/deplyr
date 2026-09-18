import IORedis from "ioredis";

let connection: IORedis | undefined;

/** Shared Redis connection for BullMQ queues/workers (one per process). */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return connection;
}
