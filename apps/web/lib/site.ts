/** One place for the site's public identity — used by the metadata, the
 * sitemap, robots, the OG image and the structured data, so they can't
 * drift apart. Overridable so a self-hoster's copy can canonicalize to its
 * own domain, but defaults to the official site. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://deplyr.abhilaksharora.com").replace(/\/$/, "");
export const GITHUB_URL = "https://github.com/deplyr/deplyr";
export const SITE_NAME = "Deplyr";
export const SITE_TITLE = "Deplyr — open-source, self-hosted deploy platform for your own server";
export const SITE_DESCRIPTION =
  "Turn any VPS into your own deploy platform. Deploy from GitHub, run Postgres and Redis, get domains with free SSL, plus monitoring and Discord/Slack alerts — open source, installed with one command.";
export const SITE_KEYWORDS = [
  "self-hosted PaaS",
  "open source Heroku alternative",
  "Vercel alternative",
  "Coolify alternative",
  "deploy from GitHub",
  "VPS deployment",
  "Docker deployment",
  "Next.js hosting",
  "self-host Postgres and Redis",
  "Let's Encrypt SSL",
  "Deplyr",
];
