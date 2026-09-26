# Monitoring and alerts

## Server health

Each agent sends a heartbeat every 15 seconds with CPU, memory, disk, load and
uptime. The server page shows the latest values and history charts from 1 hour to
7 days. If heartbeats stop for more than 60 seconds the server shows as offline.

## App health

Every 60 seconds a background job requests each live app's health check path over
HTTP, the way a visitor would. A success response means healthy. The project page
shows the current state. You set the path in **Project → Settings**.

## Activity log

Every action is recorded: deploys, database changes, server installs, agent
connects and disconnects, secret changes, domain events and alerts. Secret changes
record which secret was touched, never its value. The log is available per server
and across the instance.

## Notifications

Add a channel under **Notifications**. Deplyr supports **Discord** and **Slack**
webhooks. It sends a test message before saving, so a wrong webhook is caught
immediately.

| Event | When |
|---|---|
| App down / recovered | An app's health check starts failing or passes again |
| Deploy succeeded / failed | A deploy finishes |
| Server offline / online | Heartbeats stop, or come back |
| Database down | A database stops responding |

**No spam.** Alerts are de-duplicated: an ongoing problem is announced once, and
"back online" is only sent if the "offline" message was sent. A server that
reconnects briefly does not alert.

**Delivery history.** Every message, including failed deliveries and the reason, is
listed under Notifications.

Messages include an **Open in Deplyr** link when `WEB_URL` is set.
