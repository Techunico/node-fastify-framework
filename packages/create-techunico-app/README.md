# @techunico/node-framework

Creates a Fastify 5 + TypeScript API with PostgreSQL (Prisma) or MongoDB (Mongoose),
JWT auth, validation, health/readiness, metrics and optional plugins.

```bash
npx @techunico/node-framework my-api
```

Requires Node.js 20 or newer.

## Options

```text
create-techunico-app <project-name> [options]

  --db <postgresql|mongodb>   Database
  --plugins <list|none>       Comma-separated optional plugins
  --pm <npm|yarn|pnpm>        Package manager
  --skip-install              Generate files only
  -y, --yes                   Use defaults (postgresql, no plugins, npm) instead of prompting
```

Project names must be lowercase npm-style names (`my-api`, `orders.v2`); the project is always
created as a new directory inside the current directory.

## Optional plugins

| Plugin | Provides | Requires | Packages |
|---|---|---|---|
| `redis` | `app.redis` | — | ioredis |
| `cache` | `app.cache` | redis | — |
| `queue` | `app.queue` (BullMQ) | redis | bullmq |
| `events` | `app.event` | queue | — |
| `geo` | `app.geo` (Google Maps Platform) | — (uses cache if enabled) | axios, geolib |
| `cloudinary` | `app.cloudinary` | — | cloudinary |
| `payment` | `app.payment` (Razorpay) | — | razorpay |

Required plugins are added automatically. Only selected plugins are copied into the project and
only their packages are installed.

## What you get

- `.env` with unique, random JWT secrets (never printed); `.env.example` without secrets
- `.gitignore` excluding `.env`, `node_modules`, `dist`, generated clients
- Scripts: `dev`, `build`, `start`, `typecheck`, `test`, `make:module`, `seed` (+ Prisma scripts)
- Startup validation: weak secrets, unknown plugins, missing plugin packages or credentials fail fast
- Production safeguards: security headers, CORS allowlist, rate limiting (stricter on login and
  register), protected `/metrics`, graceful shutdown, structured logs with credential redaction

See the generated project's README for configuration details.
