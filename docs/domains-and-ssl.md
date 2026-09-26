# Domains and HTTPS

## The dashboard's address

Right after install the dashboard is on the server's IP over HTTP. To use a domain
with HTTPS, point the domain's `A` record at the server, then add it in
**Settings → Instance address**. Deplyr checks the DNS, and Caddy obtains a
certificate automatically. No restart or file editing is needed.

## App addresses

Every project gets a free address.

- **Local server:** `<project>.<server-ip-with-dashes>.sslip.io`, for example
  `myapp.203-0-113-7.sslip.io`. sslip.io is a public wildcard DNS service that
  resolves such names to the IP written in them. These addresses use HTTP.
- **With your own base domain:** set `DEPLYR_APP_DOMAIN` and point a wildcard DNS
  record at the server. Apps get `<project>.<your-domain>` with HTTPS.
- **Extra servers:** the server's IP, or `<project>.<DEPLYR_APP_DOMAIN>` when set.

## Custom domains

Any project can have its own domains, from the project's **Domains** tab.

1. Enter the hostname. Deplyr shows the DNS record to create, normally an `A`
   record pointing at the server's IP (a `CNAME` when an app domain is set).
2. A background job checks the DNS every couple of minutes. The domain shows
   **Waiting on DNS** until it matches.
3. Once DNS matches, the app must have been deployed once. Then Deplyr sets up
   routing and requests a certificate.
4. The domain becomes **Active** with HTTPS, and shows the certificate's expiry.

Statuses: `pending_dns` → `provisioning` → `active`, or `error` with the reason and
a **Retry** button. Failures while setting up are never retried automatically, so a
misconfigured domain can't hit Let's Encrypt's rate limits. You press Retry.

**Using Cloudflare?** Set the record to **DNS only** (grey cloud). Behind the orange
cloud the domain resolves to Cloudflare, so Deplyr can't verify it and a
certificate can't be issued. Deplyr detects this and says so.

## How certificates are issued

| Where the app runs | Who does it |
|---|---|
| Local server | **Caddy.** The domain is added to Caddy's config, and Caddy gets and renews the certificate itself. Deplyr waits for it and records the expiry. |
| Extra server | **certbot** on that server, using an nginx config the agent writes. A daily job renews and updates each domain's expiry. |

Removing a domain deletes its routing and certificate.

## Ports

Only **80** and **443** need to be open on the server. Both certificate methods use
port 80 for the challenge.
