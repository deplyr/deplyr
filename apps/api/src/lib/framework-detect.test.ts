import { describe, expect, test } from "bun:test";
import { analyzeRepo, packageManagerFromField, pickNodeVersion, pickPackageManager, type RepoSnapshot } from "./framework-detect";

type Kind = "file" | "dir";
const snap = (over: Partial<Omit<RepoSnapshot, "files">> & { files?: Record<string, Kind> } = {}): RepoSnapshot => ({
  rootDir: "",
  packageJson: null,
  nvmrc: null,
  dockerfile: null,
  ...over,
  files: new Map(Object.entries(over.files ?? {})),
});

describe("package manager", () => {
  test("packageManager field wins over lockfiles", () => {
    const files = new Map<string, Kind>([["yarn.lock", "file"]]);
    expect(pickPackageManager(files, { packageManager: "pnpm@9.1.0+sha512.abc" }).pm).toBe("pnpm");
  });
  test.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ])("%s -> %s", (lock, pm) => {
    expect(pickPackageManager(new Map([[lock, "file"]]), {}).pm).toBe(pm as never);
  });
  test("no lockfile -> npm", () => expect(pickPackageManager(new Map(), {}).pm).toBe("npm"));
  test("ignores unknown packageManager values", () => expect(packageManagerFromField("deno@1")).toBeNull());
});

describe("node version", () => {
  test.each([
    ["v18.19.0", undefined, "18"],
    ["20", undefined, "20"],
    ["22.3.0", undefined, "22"],
    [null, ">=18", "20"], // "18 or newer": the default satisfies it
    [null, ">=22", "22"],
    [null, "^22.1.0", "22"],
    [null, "20.x", "20"],
    [null, "16", "18"], // older than anything supported -> lowest supported
    [null, "23", "22"], // newer than anything supported -> newest supported
    ["lts/*", undefined, "20"], // aliases can't be resolved -> default
    [null, undefined, "20"],
    [null, "garbage", "20"],
  ])("nvmrc=%p engines=%p -> %s", (nvmrc, engines, expected) => {
    expect(pickNodeVersion(nvmrc as string | null, engines as string | undefined).version).toBe(expected as never);
  });
  test(".nvmrc takes priority over engines", () => {
    expect(pickNodeVersion("18", ">=22").version).toBe("18");
  });
});

describe("framework detection", () => {
  test("Next.js", () => {
    const r = analyzeRepo(snap({ files: { "package.json": "file", "pnpm-lock.yaml": "file" }, packageJson: { dependencies: { next: "15", react: "19" }, scripts: { build: "next build", start: "next start" } } }));
    expect(r.framework).toBe("nextjs");
    expect(r.settings.packageManager).toBe("pnpm");
  });

  test("Next.js only in devDependencies still counts", () => {
    expect(analyzeRepo(snap({ packageJson: { devDependencies: { next: "14" } } })).framework).toBe("nextjs");
  });

  test("NestJS uses the project's start:prod script when it has one", () => {
    const r = analyzeRepo(snap({ files: { "yarn.lock": "file" }, packageJson: { dependencies: { "@nestjs/core": "10" }, scripts: { build: "nest build", "start:prod": "node dist/apps/api/main" } } }));
    expect(r.framework).toBe("nestjs");
    expect(r.settings.startCommand).toBe("corepack enable && yarn run start:prod");
  });

  test("NestJS without start:prod leaves the default (node dist/main)", () => {
    const r = analyzeRepo(snap({ packageJson: { dependencies: { "@nestjs/core": "10" }, scripts: { build: "nest build" } } }));
    expect(r.framework).toBe("nestjs");
    expect(r.settings.startCommand).toBeUndefined();
  });

  test("Nest wins over the generic Node path", () => {
    const r = analyzeRepo(snap({ packageJson: { dependencies: { "@nestjs/core": "10" }, scripts: { start: "nest start" } } }));
    expect(r.framework).toBe("nestjs");
  });

  test("plain Node with a build script runs it explicitly", () => {
    const r = analyzeRepo(snap({ packageJson: { scripts: { build: "tsc", start: "node dist/index.js" } } }));
    expect(r.framework).toBe("node");
    expect(r.settings.buildCommand).toBe("npm run build");
  });

  test("plain Node without a build script skips the step (empty string)", () => {
    const r = analyzeRepo(snap({ packageJson: { scripts: { start: "node server.js" } } }));
    expect(r.framework).toBe("node");
    expect(r.settings.buildCommand).toBe("");
  });

  test("Node with only a main field", () => {
    const r = analyzeRepo(snap({ packageJson: { main: "server.js" } }));
    expect(r.framework).toBe("node");
    expect(r.settings.startCommand).toBe("node server.js");
  });

  test("package.json with no start script and no Dockerfile is unsupported, with a hint", () => {
    const r = analyzeRepo(snap({ packageJson: { scripts: { test: "jest" } } }));
    expect(r.framework).toBeNull();
    expect(r.notes.join(" ")).toContain("start");
  });

  test("Dockerfile only", () => {
    const r = analyzeRepo(snap({ files: { Dockerfile: "file" }, dockerfile: "FROM python:3.12\nEXPOSE 8000\nCMD python app.py" }));
    expect(r.framework).toBe("dockerfile");
    expect(r.hasPackageJson).toBe(false);
    expect(r.notes.join(" ")).toContain("exposes 8000");
  });

  test("Dockerfile that already reads $PORT doesn't get the mismatch warning", () => {
    const r = analyzeRepo(snap({ files: { Dockerfile: "file" }, dockerfile: "FROM node\nEXPOSE 3000\nCMD node server.js --port $PORT\nENV PORT=3000" }));
    expect(r.notes.join(" ")).not.toContain("exposes");
  });

  test("package.json + Dockerfile: auto wins, but the Dockerfile is offered", () => {
    const r = analyzeRepo(snap({ files: { Dockerfile: "file" }, packageJson: { dependencies: { next: "15" } } }));
    expect(r.framework).toBe("nextjs");
    expect(r.hasDockerfile).toBe(true);
    expect(r.notes.join(" ")).toContain("Dockerfile");
  });

  test("start-less package.json + Dockerfile falls back to the Dockerfile", () => {
    const r = analyzeRepo(snap({ files: { Dockerfile: "file" }, packageJson: { scripts: { test: "jest" } } }));
    expect(r.framework).toBe("dockerfile");
  });

  test("monorepo root gets a hint to set the root directory", () => {
    const r = analyzeRepo(snap({ files: { apps: "dir", packages: "dir", "turbo.json": "file" } }));
    expect(r.framework).toBeNull();
    expect(r.notes.join(" ")).toContain("monorepo");
  });

  test("rootDir is carried into the settings", () => {
    const r = analyzeRepo(snap({ rootDir: "apps/web", packageJson: { dependencies: { next: "15" } } }));
    expect(r.settings.rootDir).toBe("apps/web");
  });

  test("empty folder", () => {
    const r = analyzeRepo(snap());
    expect(r.framework).toBeNull();
    expect(r.hasPackageJson).toBe(false);
  });
});
