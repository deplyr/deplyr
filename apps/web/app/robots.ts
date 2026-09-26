import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the public site is indexable. Everything behind the login is one
// person's private control plane — there's nothing there for a crawler.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/docs"], disallow: ["/dashboard", "/servers", "/projects", "/activity", "/notifications", "/settings", "/login", "/setup"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
