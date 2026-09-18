/** Hono `Env` used across the app so `c.get`/`c.set` are typed consistently. */
export type AppEnv = {
  Variables: {
    userId: string;
  };
};
