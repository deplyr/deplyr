/**
 * Payload shapes for each "deploy.<step>" command sent worker -> agent (via
 * the Redis bridge, see docs/PHASE1_DESIGN.md section 5.4). Internal
 * control-plane-generated protocol, not external input, so plain
 * interfaces rather than zod schemas — kept in one place so worker
 * (constructs) and agent (destructures) share the same shape.
 */

export interface DeployCloneCommandPayload {
  /** Includes an embedded short-lived GitHub access token — see section 5.1. */
  cloneUrl: string;
  branch: string;
  srcDir: string;
}

/**
 * `workDir` is the app's folder inside the clone (the clone root, or its
 * `rootDir` subfolder for monorepos). `envFile` lives *outside* the source
 * tree on purpose: a Dockerfile's `COPY . .` must never be able to bake
 * secrets into an image layer.
 */
export interface DeployInstallCommandPayload {
  workDir: string;
  /** Runtime image for the project (auto mode). */
  image: string;
  /** Shell command run in the container; null = skip the step. */
  command: string | null;
}

export interface DeployWriteEnvCommandPayload {
  envFile: string;
  env: Record<string, string>;
}

export interface DeployBuildCommandPayload {
  mode: "auto" | "dockerfile";
  workDir: string;
  envFile: string;
  /** auto mode: runtime image + the build command (null = skip). */
  image: string;
  command: string | null;
  /** dockerfile mode: path relative to workDir, and the tag to build. */
  dockerfile: string;
  imageTag: string;
}

export interface DeployStartCommandPayload {
  mode: "auto" | "dockerfile";
  workDir: string;
  envFile: string;
  containerName: string;
  port: number;
  /** auto mode: runtime image + start command. */
  image: string;
  command: string;
  /** dockerfile mode: the image the build step produced. */
  imageTag: string;
  /** Extra variables applied after the env file (PORT is always set). */
  extraEnv: Record<string, string>;
}

export interface DeployNginxCommandPayload {
  slug: string;
  /** null on self-host until a domain is configured — the agent then
   * serves this project on the box's bare IP instead of a hostname. */
  domain: string | null;
  port: number;
}

export interface DeploySslCommandPayload {
  slug: string;
  domain: string | null;
  port: number;
  /** Both present or both absent — see section 5.3 for the no-cert fallback. */
  certPem?: string;
  keyPem?: string;
}

export interface DeployHealthCheckCommandPayload {
  port: number;
  path: string;
}

export interface DeployCommandPayloadByStep {
  clone: DeployCloneCommandPayload;
  install: DeployInstallCommandPayload;
  build: DeployBuildCommandPayload;
  write_env: DeployWriteEnvCommandPayload;
  start: DeployStartCommandPayload;
  nginx: DeployNginxCommandPayload;
  ssl: DeploySslCommandPayload;
  health_check: DeployHealthCheckCommandPayload;
}

/** Payload for "db.provision" — creates (or re-creates) a database container.
 * `databaseId` becomes a container label so the agent can find it again when
 * sampling health. The password is generated control-plane side and travels
 * only over the agent's authenticated socket. */
export interface DbProvisionPayload {
  databaseId: string;
  type: "postgres" | "redis";
  containerName: string;
  version: string;
  port: number;
  password: string;
  memoryLimitMb: number | null;
  postgres?: { dbName: string; username: string };
  redis?: { policy: string; persistence: string };
}

/** Payload for "db.start" / "db.stop" / "db.restart". */
export interface DbLifecyclePayload {
  containerName: string;
}

/** Payload for "db.remove" — always removes the container; the volume only on request. */
export interface DbRemovePayload {
  containerName: string;
  removeVolume: boolean;
}
