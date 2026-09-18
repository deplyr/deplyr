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

export interface DeployInstallCommandPayload {
  srcDir: string;
}

export interface DeployBuildCommandPayload {
  srcDir: string;
}

export interface DeployWriteEnvCommandPayload {
  srcDir: string;
  env: Record<string, string>;
}

export interface DeployStartCommandPayload {
  srcDir: string;
  containerName: string;
  port: number;
}

export interface DeployNginxCommandPayload {
  slug: string;
  domain: string;
  port: number;
}

export interface DeploySslCommandPayload {
  slug: string;
  domain: string;
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
