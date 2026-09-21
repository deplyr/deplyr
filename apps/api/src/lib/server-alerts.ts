import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, notifications, notify, servers } from "@deplyr/db";

// An agent that drops and reconnects within this window (an API restart, a
// network blip) isn't worth telling anyone about.
const OFFLINE_GRACE_MS = 60_000;
const RECOVERY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const isConnected = (serverId: string) => connectedCheck?.(serverId) ?? false;
let connectedCheck: ((serverId: string) => boolean) | undefined;

/** ws/agent.ts registers how to ask "is this agent connected right now?". */
export function registerConnectionCheck(fn: (serverId: string) => boolean) {
  connectedCheck = fn;
}

export function agentDisconnected(serverId: string) {
  clearTimeout(pending.get(serverId));
  pending.set(
    serverId,
    setTimeout(async () => {
      pending.delete(serverId);
      if (isConnected(serverId)) return; // it came back
      const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
      if (!server) return;
      await notify({
        ownerId: server.userId,
        event: "server.offline",
        title: `${server.name} is offline`,
        message: "Its agent lost its connection to Deplyr and hasn't come back. Your apps on it may be unreachable.",
        fields: [
          { name: "Server", value: server.name },
          { name: "Address", value: server.ipAddress },
        ],
        link: `/servers/${server.id}`,
        serverId: server.id,
        serverName: server.name,
        dedupeKey: `server:${server.id}:offline`,
        cooldownMs: 10 * 60_000,
      });
    }, OFFLINE_GRACE_MS),
  );
}

/** Only announces "back online" if we actually announced "offline" — otherwise a routine reconnect would be noise. */
export async function agentConnected(serverId: string) {
  clearTimeout(pending.get(serverId));
  pending.delete(serverId);

  const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
  if (!server) return;

  const [last] = await db
    .select({ event: notifications.event })
    .from(notifications)
    .where(
      and(
        eq(notifications.serverId, serverId),
        inArray(notifications.event, ["server.offline", "server.online"]),
        eq(notifications.status, "sent"),
        gte(notifications.createdAt, new Date(Date.now() - RECOVERY_LOOKBACK_MS)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (last?.event !== "server.offline") return;

  await notify({
    ownerId: server.userId,
    event: "server.online",
    title: `${server.name} is back online`,
    message: "Its agent reconnected to Deplyr.",
    fields: [{ name: "Server", value: server.name }],
    link: `/servers/${server.id}`,
    serverId: server.id,
    serverName: server.name,
    dedupeKey: `server:${server.id}:online`,
    cooldownMs: 60_000,
  });
}
