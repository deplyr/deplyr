/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output keeps the production Docker image small — see
  // infra/docker/web.Dockerfile.
  output: "standalone",
};

export default nextConfig;
