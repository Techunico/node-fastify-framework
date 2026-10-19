# Techunico App

Generated with `npx @techunico/node-framework` (Fastify 5, TypeScript, Zod). Requires Node.js 20+.

## Quick start

The generator created `.env` (with unique JWT secrets) and installed dependencies.

```bash
# PostgreSQL apps: create the schema, then seed roles
npm run migrate
npm run seed

# MongoDB apps: seed roles
npm run seed

npm run dev
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server (`node dist/server.js`) |
| `npm run typecheck` | Type-check source and tests |
| `npm test` | Jest tests (the example in `tests/` needs no database) |
| `npm run make:module <name>` | Scaffold a module (`order-items` → `/api/v1/order-items`) |
| `npm run seed` | Create default roles and permissions (idempotent) |

## Configuration

Settings are environment variables validated at startup (`src/config/env.schema.ts`); errors name
the variable, never its value. Optional plugins validate their own variables only when enabled.

| Variable | Default | Notes |
|---|---|---|
| `DB_PROVIDER` | set by generator | `postgresql` or `mongodb` |
| `DATABASE_URL` / `MONGO_URI` | — | required for the selected database |
| `JWT_SECRET` | — | required, ≥ 32 random characters; placeholders are rejected |
| `JWT_ADMIN_SECRET` | — | optional key for admin tokens; must differ from `JWT_SECRET` |
| `JWT_ISSUER`, `JWT_AUDIENCE` | `techunico`, `techunico-api` | set per app/environment |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | `15m`, `30d` | |
| `PLUGINS` | set by generator | only plugins whose files exist in `src/plugins` |
| `CORS_ORIGINS` | none (any origin in development) | comma-separated; `*` is rejected in production |
| `TRUST_PROXY` | `false` | `true`, a hop count, or proxy IPs/CIDRs |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `300` / `1 minute` | per client IP; Redis-backed when `redis` is enabled |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW` | `10` / `1 minute` | login and register |
| `METRICS_ENABLED` | `true` | |
| `METRICS_TOKEN` | — | bearer token for `/metrics`; required in production unless `METRICS_PUBLIC=true` |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | graceful shutdown limit |

Never commit `.env`.

## API

Base URL: `/api/v1`

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me        Authorization: Bearer <access token>
GET  /api/v1/user
GET  /health                liveness
GET  /ready                 readiness (database + enabled plugins)
GET  /metrics               Prometheus
```

Errors use one envelope: `{ "success": false, "data": null, "error": { "type", "message" } }`.

## Authentication and authorization

`authGuard` accepts only access tokens signed with the configured keys (HS256, issuer, audience
and expiry checked). Use `authorize({ permissions, roles, userTypes })` after it; an admin token
does not bypass permission checks.

```ts
app.get("/reports", { preHandler: [authGuard, authorize({ permissions: ["report.read"] })] }, handler);
```

## Structure

```text
src/
├── config/     environment schema and loadConfig()
├── core/       JWT, guards, errors, readiness, lifecycle, module loader
├── modules/    feature modules, auto-registered from src/modules/<name>/index.ts
├── plugins/    database binding, core plugins, generated optional plugins
└── types/      Fastify type augmentation and the services container type
```

Optional plugin packages and requirements are listed in `src/framework.manifest.json`.
Enabling a plugin whose files or packages are missing fails at startup with instructions.
