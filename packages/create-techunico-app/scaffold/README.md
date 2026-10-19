# Techunico App

Generated with `npx @techunico/node-framework` (Fastify 5, TypeScript, Zod).

## Quick start

The generator already created `.env` (with unique JWT secrets) and installed dependencies.

```bash
# PostgreSQL apps: create the schema, then seed roles
npm run migrate
npm run seed

# MongoDB apps: seed roles
npm run seed

npm run dev
```

Requires Node.js 20 or newer.

## Configuration

All settings come from environment variables, validated at startup (`src/config/env.schema.ts`).
The app refuses to start with a missing or weak `JWT_SECRET`.

| Variable | Purpose |
|---|---|
| `DB_PROVIDER` | Fixed by the generator (`postgresql` or `mongodb`) |
| `DATABASE_URL` / `MONGO_URI` | Database connection string |
| `JWT_SECRET` | Signs user tokens (≥ 32 random characters) |
| `JWT_ADMIN_SECRET` | Optional, signs admin tokens; must differ from `JWT_SECRET` |
| `PLUGINS` | Comma-separated optional plugins that were generated into this app |

Never commit `.env`.

## Plugins

Only the plugins chosen at generation time are included (`src/plugins/<name>`), together with their npm packages.
Enabling a plugin that is not installed fails at startup with the package names to install.
The plugin list and requirements are in `src/framework.manifest.json`.

## API

Base URL: `/api/v1`

```
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me        (Authorization: Bearer <access token>)
GET  /api/v1/user
GET  /health                 liveness
GET  /ready                  readiness (database, redis when enabled)
GET  /metrics                Prometheus metrics
```

## Authorization

`authGuard` verifies the access token. Use `authorize({ permissions, roles, userTypes })`
after it to enforce access rules; an admin token does not bypass permission checks.

## Structure

```
src/
├── config/     environment schema and derived config
├── core/       error handling, auth guard, validation, module loader
├── modules/    feature modules (auto-registered: src/modules/<name>/index.ts)
├── plugins/    database binding, core plugins, generated optional plugins
└── types/      Fastify type augmentation
```

Create a module with `npm run make:module <name>`.
