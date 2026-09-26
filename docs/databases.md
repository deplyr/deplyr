# Databases

Deplyr can create **PostgreSQL** and **Redis** databases on any connected server.

## Creating one

From a server's **Databases** tab, choose the type and set:

- version
- port
- memory limit
- for Redis: eviction policy and persistence

The worker sends a provision command to the agent, which starts a container with a
generated password. Provisioning has statuses you can follow in the dashboard.

## Access

Databases are **private**. Each container listens on the server's loopback address
(`127.0.0.1`) only, so nothing outside the machine can reach it. Your apps on the
same server can, because apps also use host networking.

Credentials and the connection string are shown on demand.

There are two ways to look inside a database without opening any port:

**Console (in the dashboard).** Each database page has a console. For Postgres you
type SQL and see the results as a table; for Redis you type a command such as
`GET mykey`. The agent runs it inside the database's own container with
`docker exec`, so nothing listens on the network.

- Postgres sessions are **read-only by default**. Tick **Allow changes** to run
  inserts, updates, deletes and DDL.
- Queries stop after about 13 seconds, and results are capped (500 rows, 256 KB).
- Redis commands that stream or reconfigure the server (`MONITOR`, `SUBSCRIBE`,
  `CONFIG`, `SHUTDOWN` and similar) are blocked.
- The activity log records that a query ran, never its text.

**Your own client (SSH tunnel).** For TablePlus, DBeaver or `psql` on your computer,
the database page shows a ready-to-copy tunnel command:

```bash
ssh -i ~/path/to/your-key.pem -N -L 5432:127.0.0.1:5432 <ssh-user>@<server-ip>
```

Leave it running, then connect to `localhost:5432`. The login user depends on the
image: `ec2-user` on Amazon Linux, `ubuntu` on Ubuntu, `root` on most other
providers. It needs only SSH (port 22), which is normally open already.

## Management

Start, stop, restart and remove from the database page. Containers restart
automatically after a reboot.

## Stats and health

The agent samples every database every 30 seconds and reports whether it is up, how
long a check took, and type-specific numbers.

| Type | Stats |
|---|---|
| PostgreSQL | Connections, cache hit ratio |
| Redis | Memory use, hit rate |

These are stored as history and shown as charts. Container logs are available too.
A database that goes down raises an alert if you have a channel set up.

## Passwords

Database passwords are encrypted at rest with the instance's master key.
