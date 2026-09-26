# Deploy pipeline

Pressing **Deploy** creates a deploy record with eight steps and queues it. The
worker runs the steps in order on the project's server. Each step's output is
saved and streamed to the dashboard.

## Before the first step

- The project's server must be connected, and GitHub must be connected.
- Every project gets its own **port** from 20000 to 29999, chosen once and kept.
  Apps run with host networking, so ports are unique across a server.
- The project's environment variables are decrypted for the deploy.
- The build plan is worked out from the framework and the project's settings.

## The steps

| # | Step | What happens |
|---|---|---|
| 1 | `clone` | Fetches the repo at the chosen branch with the GitHub token |
| 2 | `install` | Installs dependencies with the detected package manager |
| 3 | `write_env` | Writes the environment variables to a file outside the source folder |
| 4 | `build` | Runs your build command, or builds your Dockerfile into an image |
| 5 | `start` | Removes the old container and starts the new one on the project's port |
| 6 | `nginx` | Routes the app's address to its port |
| 7 | `ssl` | Sets up HTTPS for the address where possible |
| 8 | `health_check` | Requests the health check path until the app answers |

`write_env` comes before `build` because frameworks such as Next.js read some
variables (`NEXT_PUBLIC_*`) at build time.

If a step fails, the deploy stops there and is marked failed, and the step's log
shows why. The running app is only replaced at `start`, so a failure in clone,
install or build leaves it untouched.

**How the app runs.** Node projects (Next.js, NestJS, plain Node) run from a Node
image with the source folder mounted, using the project's start command. Dockerfile
projects run the image built from your Dockerfile. Either way the container is
named `deplyr-<project>` and restarts automatically unless stopped.

**Routing.** On the local server, steps 6 and 7 are handled by Caddy: the app is
added to Caddy's config and Caddy takes care of certificates. On extra servers the
agent writes an nginx config for the app.

## Detection and the build plan

When you pick a repo, Deplyr reads it and suggests settings:

| Detected | How |
|---|---|
| **Next.js** | `next` in `package.json` |
| **NestJS** | `@nestjs/core` in `package.json` |
| **Node** | A `package.json` with a start script (or a `main` file) |
| **Dockerfile** | A `Dockerfile` in the folder |
| **Package manager** | The `packageManager` field, else the lockfile (npm, pnpm, yarn, bun) |
| **Node version** | `.nvmrc` or `.node-version`, otherwise 20 |
| **Monorepo folder** | The root folder you choose |

Everything detected can be edited in the project's settings: root folder, install,
build and start commands, Node version and health check path. The settings page and
the deploy use the same code, so what you see is what runs.

## Your app and the port

Deplyr sets a `PORT` environment variable on the container, and **your app must
listen on it**.

## Health check

The final step requests the health check path (default `/`) up to 10 times, 2
seconds apart, and passes on the first successful response. If your app returns an
error on `/`, set the path to a route that works, such as `/health`, in
**Project → Settings**. The same path is used by the ongoing health checks.

## Environment variables

Stored encrypted. They are used by the build and the running app, kept in a file
outside your source tree, and never baked into an image layer. Changes apply on the
next deploy.

## Live status

Progress is stored per step (`pending`, `running`, `success`, `failed`) with its
log. The project page shows a progress bar while a deploy runs, and each deploy has
its own page with the full log. A finished deploy sends a Discord or Slack message
if you have set up a channel.
