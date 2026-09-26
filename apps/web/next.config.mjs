/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output keeps the production Docker image small — see
  // infra/docker/web.Dockerfile.
  // Vercel has its own output format; standalone is only for the Docker image.
  output: process.env.VERCEL ? undefined : "standalone",
  // Browsers still probe /favicon.ico regardless of <link rel=icon>; point it at the SVG.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
};

export default nextConfig;
