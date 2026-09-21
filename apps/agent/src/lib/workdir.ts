import { stat } from "node:fs/promises";

/** A wrong `rootDir` would otherwise surface as an opaque docker error. */
export async function assertWorkDir(workDir: string): Promise<void> {
  const info = await stat(workDir).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(
      "The root directory you set doesn't exist in this repository at the selected branch. Check it in the project's build settings.",
    );
  }
}

/** One shared volume for every package manager's download cache, so repeat
 * deploys don't re-download the world. Content-addressed, so sharing it
 * across projects is safe. */
export const PKG_CACHE_VOLUME = "deplyr-pkg-cache";
export const PKG_CACHE_ARGS = [
  "-v",
  `${PKG_CACHE_VOLUME}:/pkgcache`,
  "-e",
  "npm_config_cache=/pkgcache/npm",
  "-e",
  "YARN_CACHE_FOLDER=/pkgcache/yarn",
  "-e",
  "npm_config_store_dir=/pkgcache/pnpm",
  "-e",
  "BUN_INSTALL_CACHE_DIR=/pkgcache/bun",
];
