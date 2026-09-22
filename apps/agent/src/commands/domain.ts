import { mkdir, rm, writeFile } from "node:fs/promises";
import { runProcess } from "../lib/run-process";
import { captureProcess } from "../lib/capture-process";
import { findCertificate, parseCertbotCertificates } from "../lib/certbot";
import { ACME_WEBROOT_DIR, CERTBOT_DIR, CERT_DIR, NGINX_CONF_DIR } from "../lib/paths";

/**
 * Custom domains, on top of the free operator-managed wildcard subdomain
 * (see ssl.ts). A domain goes through two agent commands, called in order
 * by the worker once DNS has been verified control-plane-side:
 *
 *   1. domain.configureHttp — HTTP-only nginx block, so the ACME HTTP-01
 *      challenge below has somewhere to be served from.
 *   2. domain.issueCert     — obtains a real Let's Encrypt certificate via
 *      a certbot container, then writes the HTTPS block.
 *
 * Splitting them (rather than one command) mirrors deploy.nginx/deploy.ssl,
 * and means a cert failure leaves the domain serving plain HTTP instead of
 * nothing.
 */

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Every handler here takes a hostname from the control plane; re-checking
 * its shape before it reaches a shell command or a file path is cheap
 * insurance against a bug upstream, not the primary validation (that's
 * checkHostnameFormat in shared-types, enforced when the domain is created). */
function assertHostname(hostname: unknown): asserts hostname is string {
  if (typeof hostname !== "string" || !HOSTNAME.test(hostname)) {
    throw new Error("refusing to act on a malformed hostname");
  }
}

const confPath = (hostname: string, suffix: string) => `${NGINX_CONF_DIR}/domain-${hostname}${suffix}.conf`;

export async function domainConfigureHttp(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { hostname, port } = payload as { hostname: unknown; port: unknown };
  assertHostname(hostname);
  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
    throw new Error("missing or invalid port");
  }

  await mkdir(ACME_WEBROOT_DIR, { recursive: true });

  const conf = `server {
    listen 80;
    server_name ${hostname};

    location /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT_DIR};
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
  await writeFile(confPath(hostname, ""), conf, "utf8");
  emitLog(`wrote HTTP config for ${hostname}`);
  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);
}

const CERTBOT_TIMEOUT_MS = 90_000;

function certbotBaseArgs(): string[] {
  return [
    "docker",
    "run",
    "--rm",
    "-v",
    `${CERTBOT_DIR}:/etc/letsencrypt`,
    "-v",
    `${ACME_WEBROOT_DIR}:/var/www/certbot`,
    "certbot/certbot",
  ];
}

/**
 * Requests a certificate over HTTP-01 (proves control of the domain by
 * serving a file at the path above — needs domainConfigureHttp to have run
 * first) and, on success, writes the HTTPS server block. Returns the
 * certificate's expiry as an ISO string in the result detail, so the worker
 * can store it without a separate round trip — or "" if issuance failed in a
 * way that leaves the domain on HTTP (logged, not thrown: a slow cert
 * shouldn't take down a domain that was already serving HTTP correctly).
 */
export async function domainIssueCert(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<string> {
  const { hostname, port } = payload as { hostname: unknown; port: unknown };
  assertHostname(hostname);
  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
    throw new Error("missing or invalid port");
  }

  await mkdir(CERTBOT_DIR, { recursive: true });

  const args = [
    ...certbotBaseArgs(),
    "certonly",
    "--webroot",
    "-w",
    "/var/www/certbot",
    "-d",
    hostname,
    "--cert-name",
    hostname,
    "--non-interactive",
    "--agree-tos",
    "--no-eff-email",
    // No real inbox to notify — expiry is tracked in Deplyr itself instead.
    "--register-unsafely-without-email",
  ];
  emitLog(`$ ${args.join(" ")}`);
  const result = await captureProcess(args, CERTBOT_TIMEOUT_MS);
  for (const line of (result.stdout + result.stderr).split("\n")) if (line.trim()) emitLog(line);

  if (result.exitCode !== 0) {
    emitLog(`certbot exited with code ${result.exitCode} — domain stays on HTTP for now`);
    return "";
  }

  const cert = findCertificate(result.stdout, hostname);
  const live = `${CERTBOT_DIR}/live/${hostname}`;
  const conf = `server {
    listen 443 ssl;
    server_name ${hostname};

    ssl_certificate ${live}/fullchain.pem;
    ssl_certificate_key ${live}/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
  await writeFile(confPath(hostname, "-ssl"), conf, "utf8");
  emitLog(`wrote HTTPS config for ${hostname}`);
  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);

  return cert?.expiresAt ?? "";
}

export async function domainRemove(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { hostname } = payload as { hostname: unknown };
  assertHostname(hostname);

  await rm(confPath(hostname, ""), { force: true });
  await rm(confPath(hostname, "-ssl"), { force: true });
  emitLog(`removed nginx config for ${hostname}`);

  // Best-effort: an already-gone or never-issued cert is the state we want,
  // not a failure that should block removing the domain.
  await runProcess([...certbotBaseArgs(), "delete", "--cert-name", hostname, "--non-interactive"], emitLog).catch(
    () => emitLog(`no certificate to remove for ${hostname}`),
  );

  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);
}

/**
 * Renews every domain certificate close to expiry in one pass (certbot's own
 * job — it no-ops anything not due yet) and reports back what it now has, so
 * the worker's daily sweep can update every domain's row from a single
 * command instead of one round trip per domain.
 */
export async function domainRenewAll(
  _payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<string> {
  await mkdir(CERTBOT_DIR, { recursive: true });
  const renew = [...certbotBaseArgs(), "renew", "--webroot", "-w", "/var/www/certbot", "--non-interactive"];
  emitLog(`$ ${renew.join(" ")}`);
  const renewResult = await captureProcess(renew, CERTBOT_TIMEOUT_MS);
  for (const line of (renewResult.stdout + renewResult.stderr).split("\n")) if (line.trim()) emitLog(line);

  // Reload once, even if nothing renewed — cheap, and simpler than parsing
  // "renew" output to decide whether a reload is warranted.
  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog).catch(() => {});

  const list = await captureProcess([...certbotBaseArgs(), "certificates"], 30_000);
  const certs = parseCertbotCertificates(list.stdout);
  return JSON.stringify(certs.map((c) => ({ hostname: c.hostname, expiresAt: c.expiresAt, expired: c.expired })));
}
