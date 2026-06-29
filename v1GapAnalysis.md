# Techunico Node Framework v1.0 — Release Readiness Audit

**Review type:** Final architecture and implementation gate review  
**Reviewer role:** Lead Software Architect  
**Repository:** `nodejs_framework`  
**Date:** June 29, 2026  
**Method:** Full codebase verification. Historical reports (`architecture-gap-impact-analysis.md`, `issue2report.md`, `anlysysRport.md`) treated as context only. The live codebase is the source of truth.

**Verification commands run:**

| Command | Result |
|---------|--------|
| `npm run typecheck` | **FAIL** — 2 errors |
| `npm test` | **FAIL** — suite cannot load (env validation) |
| `node packages/create-techunico-app/test-compose.js` | **PASS** — PostgreSQL composition (install + generate + `tsc`) |

---

## Executive Summary

The Techunico Node Framework has a **sound architectural vision**: modular monolith, plugin-composed infrastructure, auto-loaded feature modules, Zod-validated configuration, consistent API envelopes, and observability hooks. The CLI composition pipeline has **materially improved** since earlier reviews — PostgreSQL and MongoDB projects are now structurally separated via overlays, Prisma assets are composed at generation time, and `test-compose.js` validates typecheck on generated output.

However, the framework is **not ready for a v1.0 production release** as the standard backend platform for all Techunico products.

The central problem is a **split-brain codebase**:

| Layer | Maturity |
|-------|----------|
| **CLI-generated apps** (overlays applied) | Moderate — typecheck passes, DB paths are separated, DI and auth controller fixes exist in overlays |
| **Framework source (`src/`)** | Low — auth is broken at runtime, tests do not run, typecheck fails, documented APIs are not implemented |
| **Optional subsystems** (events, queue workers, realtime, storage) | Scaffold — code exists but is not wired, tested, or documented accurately |

Approving v1 today would ship a framework whose **canonical source tree fails its own quality gates**, while generated projects depend on overlay patches that are not reflected in `src/`. Every product team would inherit runtime failures, security gaps, and undocumented behavior.

**Overall framework maturity: ~55%** — strong skeleton, incomplete integration, insufficient test and release discipline.

---

## Release Decision

### ❌ Not Ready for Release

**Why:**

1. **The framework repository does not pass its own CI-equivalent checks.** `npm test` fails before any test executes. `npm run typecheck` fails with compile errors. A v1 platform must be self-consistent.

2. **Authentication is broken in the canonical `src/` tree.** `request.services.auth` is never wired. Login issues JWTs that `authGuard` rejects. Documented `permissionGuard` does not exist. Refresh and logout are absent.

3. **Runtime contract drift is unresolved.** `app.prisma` was removed from the Prisma plugin, but health checks, user module, and metrics module still reference it. `/ready` will fail in the framework dev repo.

4. **Half the plugin ecosystem is unreachable.** Realtime, presence, rate-limit, logger, and multitenancy plugins exist but are not registered. The CLI offers WebSockets but provides no activation path.

5. **Storage is entirely absent** despite type declarations implying Cloudinary support.

6. **Test coverage is effectively zero.** One health test exists and cannot run.

7. **Documentation contradicts implementation** on auth guards, service container, Phase 2 features, and production readiness claims.

Generated CLI projects are **closer to usable** than the framework source, but they still lack production `build`/`start` scripts, safe secret generation, bundled Prisma migrations, and complete optional-plugin wiring. That is not a v1 platform standard.

---

## Architecture Review

### Folder Structure & Module Boundaries

```
src/
├── app.ts              # Composition root
├── server.ts           # Entry
├── config/             # Zod env + typed config
├── core/               # Guards, error handler, module loader, metrics
├── modules/            # Feature modules (auto-loaded)
├── plugins/            # Infrastructure plugins
├── events/             # Event bus + listeners (unwired)
├── queues/             # BullMQ workers (standalone, unstarted)
├── middleware/         # HTTP middleware (orphaned rate-limit)
├── scripts/            # make-module, build-template
└── types/              # Fastify augmentation
```

**Strengths:**

- Clear layered module pattern: `routes → controller → service → repository`
- System modules (`health`, `metrics`) correctly exempted from API prefix
- `_template` module excluded from auto-loading by `_` prefix convention
- Plugin ordering in `registerPlugins()` respects DB → JWT → response → metrics → context → services → optional chain

**Weaknesses:**

| Issue | Severity | Detail |
|-------|----------|--------|
| Framework source ≠ generated output | **Critical** | Overlays patch `services.plugin.ts`, `auth.controller.ts`, `env.schema.ts`, health routes — but `src/` retains broken versions |
| Cross-module coupling | Medium | `AuthService` imports `UserRepository` from user module; no bounded-context rules |
| Dual config paths | Medium | `server.ts` uses `config/app.ts` (port only); plugins use `config/index.ts` (full config) |
| Monolithic template copy | Medium | `build-template.ts` copies entire `src/` including dead/orphan plugin code into every generated project |
| No published `@techunico/framework-core` package | Medium | Framework source is copied, not versioned as a dependency — upgrade path undefined |
| `DatabaseAdapter` interface duplicated | Low | Defined inline in `prisma.plugin.ts`; `src/core/interfaces/database.ts` is minimal and unused by plugins |
| Module loader uses `require()` | Low | Works with ts-node but inconsistent with ESM-ready posture |

### Dependency Direction

```
server.ts → app.ts → registerPlugins → modules
                          ↓
                    config (env)
```

Dependency flow is generally correct (infrastructure inward, modules outward). Violations:

- `AuthService` reaches into user module's repository directly
- Mongoose adapter reads `process.env.MONGO_URI` directly, bypassing validated config
- Workers use `bootstrap/config.ts` instead of shared `config/index.ts`

### Scalability & Extensibility

The plugin model supports horizontal scaling patterns (stateless HTTP + Redis + BullMQ workers). However:

- No plugin manifest or topological dependency resolution
- No health contribution interface on adapters
- No request ID propagation into queue jobs
- Multitenancy hooks are commented but downstream code assumes `tenantId`
- Socket.io has no Redis adapter for multi-instance deployment

### Maintainability Assessment

The framework will accumulate debt rapidly because:

1. Every fix must be applied in **both** `src/` and overlay directories
2. `build-template` syncs to CLI template but overlays are separate
3. No CHANGELOG, migration guide, or semver policy for generated projects

---

## Implementation Gaps

### Missing Features (Documented or Implied but Not Implemented)

| Feature | Documented In | Actual State |
|---------|---------------|--------------|
| `permissionGuard` | `README.md` | **Does not exist** in `src/core/` |
| `request.services.auth` | README, auth controller | **Empty container** in `src/plugins/services.plugin.ts` |
| `request.services.prisma` | README | **Never implemented** |
| Refresh token endpoint | JWT plugin supports it | **No `/refresh` route** |
| Logout / session revocation | Expected for production auth | **Not implemented** |
| Storage abstraction | `fastify.d.ts` `cloudinary` type | **No storage plugin, no adapters** |
| File upload flow | Implied by storage | **Not implemented** |
| Event listener auto-registration | `event.loader.ts` exists | **Commented out** in `app.ts` |
| Worker startup scripts | Queue architecture | **No `npm run workers`** |
| WebSocket plugin activation | CLI offers "WebSockets" | **`socket` not in `registerPlugins()`** |
| Plugin manifest / discovery | `pluginMeta` exported | **Unused** |
| `build` / `start` production scripts | Expected for production | **Absent from root `package.json`**; not in generated projects |
| Initial Prisma migration | Expected for `npm run migrate` | **Not bundled** in CLI assets |
| Account lockout / auth rate limiting | Security baseline | **Not implemented** |
| `@fastify/helmet` / CORS | Security baseline | **Not configured** at app level |
| OpenAPI / API docs | DX expectation | **Not implemented** |
| `techunico.config.ts` / framework version tracking | Prior architecture docs | **Not implemented** |

### Partially Implemented Features

| Feature | What Exists | What's Missing |
|---------|-------------|----------------|
| RBAC | DB schema, permissions in JWT | Enforcement guard, default user permissions, permission refresh |
| DI-lite | `request.services` hook | Service factory registry, module service wiring |
| DB abstraction | `app.db` adapter | `healthCheck()` on adapter; all consumers migrated |
| Events | `EventService`, listener, worker | Registration at boot, queue dependency check, real handlers |
| Queue | `QueueService` producer | Worker entrypoint, job registry, idempotency, DLQ |
| Realtime | Full Socket.io plugin | Registration, correct middleware ordering, Redis adapter |
| Presence | Complete Redis service | Plugin registration |
| Rate limiting | Redis service + HTTP middleware | Plugin registration; middleware requires `tenantId` that doesn't exist |
| Cache | Complete `CacheService` | No module usage; `flush()` uses blocking `KEYS` |
| Multitenancy | Commented `TenancyService` | Resolver, `request.ctx.tenant`, documentation |
| Metrics module | CRUD stub module | Unrelated to Prometheus; returns empty arrays |
| Health module | `HealthService`/`HealthController` | **Unused**; routes are inline in `health.routes.ts` |

---

## Broken Implementations

Verified bugs and runtime failures in the **framework source tree** (`src/`):

### Critical Runtime Failures

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | `request.services = {}` — `AuthService` never instantiated | `src/plugins/services.plugin.ts:9` | `/auth/register`, `/auth/login` throw `Cannot read properties of undefined` |
| 2 | `jwt.sign()` called with 1 arg; requires 3 | `src/modules/auth/auth.controller.ts:14` | TypeScript error; issued tokens have `tokenType: undefined` |
| 3 | `authGuard` rejects login tokens | `jwt.plugin.ts:50` + `auth.controller.ts:14` | `GET /auth/me` always returns 401 after login |
| 4 | `app.prisma` removed but health uses it | `health.routes.ts:20`, `prisma.plugin.ts:74` | `/ready` database check throws |
| 5 | `app.redis` accessed unconditionally | `health.routes.ts:29` | `/ready` throws when Redis plugin disabled |
| 6 | `UserController` uses `request.server.prisma` | `user.controller.ts:6` | `GET /api/v1/user` throws at runtime |
| 7 | Test env defaults are no-ops | `config/env.ts:8-12` | `npm test` fails before suite loads |
| 8 | `events` plugin requires `app.queue` | `events.plugin.ts:11` | Enabling `PLUGINS=events` without `queue` crashes startup |

### Security Defects

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | `jwt.decode()` before `jwt.verify()` | `jwt.plugin.ts:37-44` | Unverified claims influence secret selection |
| 2 | Hardcoded admin secret `"secret_admin"` | `jwt.plugin.ts:12` | Predictable secret for admin tokens |
| 3 | Fallback secrets `"secret_user"` | `jwt.plugin.ts:14-16` | Weak defaults if env bypassed |
| 4 | No algorithm allowlist on verify | `jwt.plugin.ts:44` | Algorithm confusion risk |
| 5 | `GET /api/v1/user` has no auth | `user.routes.ts` | User list is public |
| 6 | Email enumeration on register | `auth.service.ts:30` | `"Email already exists"` reveals registered emails |
| 7 | Default `JWT_SECRET=SUPERSECURESECRET` | `.env.example:27` | Copied to generated `.env` |

### Compile-Time Failures

```
src/modules/auth/auth.controller.ts(14,38): error TS2554: Expected 3 arguments, but got 1.
src/plugins/db-mongoose/mongoose.adapter.ts(1,22): error TS2307: Cannot find module 'mongoose'
```

---

## Plugin Audit

Registration path: `app.ts` → `register-plugins.ts` → `plugins/index.ts::registerPlugins()`

Activation: `PLUGINS` env comma-list. Only `redis`, `cache`, `queue`, `events` are handled.

### Core Plugins (Always Registered)

#### 1. `db-prisma` — PostgreSQL/SQLite Database

| Field | Assessment |
|-------|------------|
| **Purpose** | Prisma 7 client via driver adapters (`PrismaPg`, `PrismaBetterSqlite3`) |
| **Registration** | ✅ Dynamic import when `DB_PROVIDER=postgresql` (or `sqlite` in dev repo) |
| **Dependencies** | `config.db`, `pg`, `@prisma/adapter-pg` |
| **Implementation** | Complete — connect/disconnect, pool cleanup |
| **Production readiness** | ⚠️ **Partial** — exposes only `app.db`; consumers still use `app.prisma`. Duplicate unused `prisma.adapter.ts`. `pluginMeta` exported but consumed nowhere |

#### 2. `db-mongoose` — MongoDB Database

| Field | Assessment |
|-------|------------|
| **Purpose** | Mongoose connection via `DatabaseAdapter` |
| **Registration** | ✅ Dynamic import when `DB_PROVIDER=mongodb` |
| **Dependencies** | `MONGO_URI` from `process.env` (not validated config) |
| **Implementation** | Complete for connect/disconnect |
| **Production readiness** | ⚠️ **Partial** — `mongoose` not in root `package.json`; typecheck fails. Config bypass. Mongo overlay health check is better than main repo |

#### 3. `jwt` — JSON Web Tokens

| Field | Assessment |
|-------|------------|
| **Purpose** | Sign/verify access and refresh tokens with per-user-type routing |
| **Registration** | ✅ Always |
| **Dependencies** | `config.jwt.secret` |
| **Implementation** | Complete API surface (`sign`, `verifyAccess`, `verifyRefresh`, `refresh`) |
| **Production readiness** | ❌ **Not ready** — hardcoded secrets, unsafe decode-before-verify, refresh unused, inconsistent with realtime plugin JWT handling |

#### 4. `response` — API Envelope

| Field | Assessment |
|-------|------------|
| **Purpose** | `reply.success()` / `reply.error()` consistent shape |
| **Registration** | ✅ Always |
| **Dependencies** | None |
| **Implementation** | Complete |
| **Production readiness** | ✅ **Ready** |

#### 5. `metrics` — HTTP Prometheus Metrics

| Field | Assessment |
|-------|------------|
| **Purpose** | Request counter + duration histogram on `onResponse` |
| **Registration** | ✅ Always |
| **Dependencies** | `prom-client` via `@/core/metrics` |
| **Implementation** | Complete |
| **Production readiness** | ✅ **Ready** (exposed at `GET /metrics` via metrics module) |

#### 6. `context` — Request Context

| Field | Assessment |
|-------|------------|
| **Purpose** | Per-request `requestId` on `request.ctx`; child logger |
| **Registration** | ✅ Always |
| **Dependencies** | None |
| **Implementation** | Partial — `request.ctx.tenant` commented out |
| **Production readiness** | ✅ **Ready** for tracing; multitenancy stubbed |

#### 7. `services` — Dependency Injection Container

| Field | Assessment |
|-------|------------|
| **Purpose** | Per-request `request.services` with module services |
| **Registration** | ✅ Always |
| **Dependencies** | Should wire `AuthService`, `UserService`, etc. |
| **Implementation** | ❌ **Stub** — `request.services = {}` only |
| **Production readiness** | ❌ **Not ready** — auth module broken. PostgreSQL overlay version is correct reference |

### Optional Plugins (Conditionally Registered)

#### 8. `redis` — Redis Connection

| Field | Assessment |
|-------|------------|
| **Purpose** | ioredis client on `app.redis` |
| **Registration** | ✅ If `PLUGINS` includes `redis` |
| **Dependencies** | `config.redis` (always required in env schema even when disabled) |
| **Implementation** | Complete — logging, graceful quit on close |
| **Production readiness** | ✅ **Ready** when enabled |

#### 9. `cache` — Redis Cache

| Field | Assessment |
|-------|------------|
| **Purpose** | JSON cache with `set/get/del/remember/flush` |
| **Registration** | ✅ If `cache` in `PLUGINS` + redis enabled |
| **Dependencies** | `app.redis` |
| **Implementation** | Complete |
| **Production readiness** | ⚠️ **Partial** — `flush()` uses `KEYS` (O(N) blocking). No namespace convention. No module adoption |

#### 10. `queue` — BullMQ Producer

| Field | Assessment |
|-------|------------|
| **Purpose** | Lazy BullMQ queue map; `app.queue.add()` |
| **Registration** | ✅ If `queue` in `PLUGINS` + redis enabled |
| **Dependencies** | `app.redis`, BullMQ |
| **Implementation** | Partial — producer only |
| **Production readiness** | ❌ **Not ready** — workers are standalone scripts with `console.log` placeholders; no startup automation |

#### 11. `events` — Event Bus

| Field | Assessment |
|-------|------------|
| **Purpose** | In-process pub/sub; async listeners delegate to BullMQ |
| **Registration** | ✅ If `events` in `PLUGINS` (only checks redis, not queue) |
| **Dependencies** | `app.queue` (**not checked at registration**) |
| **Implementation** | Partial — plugin registers; listeners never loaded |
| **Production readiness** | ❌ **Not ready** — `loadEventListeners()` disabled; loader reads `dist/` path; `console.log` in plugin |

### Orphaned Plugins (Exist but NOT Registered)

#### 12. `logger` — Pino Logger Plugin

| Field | Assessment |
|-------|------------|
| **Purpose** | Decorate `app.logger` + per-request `request.log` |
| **Registration** | ❌ Not in registry |
| **Dependencies** | `loggerConfig` |
| **Implementation** | Complete but redundant |
| **Production readiness** | N/A — Fastify built-in logger used in `buildApp()` instead |

#### 13. `realtime` — Socket.io Server

| Field | Assessment |
|-------|------------|
| **Purpose** | WebSocket server with JWT auth, tenant/user rooms, presence |
| **Registration** | ❌ Not in registry; experimental comment in `app.ts` |
| **Dependencies** | `app.presence`, `app.rateLimit`, `app.redis`, HTTP server |
| **Implementation** | Partial — `connection` handler registered before auth middleware; CORS `origin: "*"`; JWT payload mismatch (`userId` vs `id`) |
| **Production readiness** | ❌ **Not ready** — unreachable without manual wiring; no Redis adapter for scaling |

#### 14. `presence` — Online/Offline Tracking

| Field | Assessment |
|-------|------------|
| **Purpose** | Redis-backed connection counting per user/tenant |
| **Registration** | ❌ Not in registry |
| **Dependencies** | `app.redis` |
| **Implementation** | Complete |
| **Production readiness** | ⚠️ **Ready if wired** — currently unreachable; only referenced by orphaned `realtime` |

#### 15. `rate-limit` — Redis Rate Limiter

| Field | Assessment |
|-------|------------|
| **Purpose** | Sliding-window `INCR` + `EXPIRE` counter |
| **Registration** | ❌ Not in registry |
| **Dependencies** | `app.redis` |
| **Implementation** | Complete service; HTTP middleware in `src/middleware/rate-limit.ts` requires `tenantId` |
| **Production readiness** | ⚠️ **Ready if wired** — middleware unusable without multitenancy |

#### 16. `multitenancy` — Tenant Resolution

| Field | Assessment |
|-------|------------|
| **Purpose** | Pluggable tenant resolver |
| **Registration** | ❌ No plugin file exists |
| **Dependencies** | Would need resolver registry |
| **Implementation** | ❌ **Stub** — entire `TenancyService` class is commented out |
| **Production readiness** | ❌ **Not implemented** — downstream code already assumes `tenantId` on users |

### Dead / Alternate Entry Points

| File | Status |
|------|--------|
| `src/plugins/redis/index.ts` | Alternate `registerPlugins()` that only registers redis — never imported |
| `src/plugins/db-prisma/prisma.adapter.ts` | Standalone adapter — not used by `prisma.plugin.ts` |
| `src/plugins/db-mongoose/mongoose.adapter.ts` | Used by plugin but `mongoose` not in root deps |
| `src/plugins/db-mongoose/package.json` | Nested package — causes Jest haste map collision |
| `src/plugins/db-prisma/package.json` | Nested package — causes Jest haste map collision |

---

## Security Audit

| Category | Finding | Severity |
|----------|---------|----------|
| **JWT secrets** | Hardcoded `"secret_admin"`; fallback `"secret_user"` | **Critical** |
| **JWT verification** | `jwt.decode()` used before `jwt.verify()` to select secret | **Critical** |
| **Token lifecycle** | No refresh endpoint, no logout, no revocation, no session store | **High** |
| **Access token TTL** | Correctly set to `15m` when `tokenType` is provided — but login doesn't provide it | **High** |
| **RBAC enforcement** | Permissions in JWT never checked; `permissionGuard` missing | **High** |
| **Route protection** | User list endpoint is public | **High** |
| **Brute force** | No rate limiting on `/auth/login` or `/auth/register` | **High** |
| **Password policy** | Minimum 8 characters only; no complexity rules | **Medium** |
| **bcrypt cost** | Fixed at 10; not configurable | **Low** |
| **Email enumeration** | Register reveals existing emails | **Medium** |
| **Default secrets** | `JWT_SECRET=SUPERSECURESECRET` in `.env.example` | **High** |
| **Upload security** | No upload flow exists | N/A |
| **Injection** | Prisma parameterized queries; Zod validation on inputs | ✅ Good |
| **Config exposure** | Production 500 errors hide messages | ✅ Good |
| **CORS / headers** | No global security headers; realtime uses `origin: "*"` | **Medium** |
| **Dependency vulnerabilities** | `npm audit` reports 3 moderate in generated project install | **Medium** |

---

## Technical Debt

### Critical

| Item | Description |
|------|-------------|
| Framework source vs overlay divergence | Fixes exist in overlays but not in `src/` — two sources of truth |
| Broken auth in canonical `src/` | DI empty, JWT sign arity wrong, auth loop broken |
| `app.prisma` → `app.db` migration incomplete | Health, user, metrics modules still use removed decoration |
| Test suite non-functional | `env.ts` test defaults broken; zero passing tests |
| Typecheck failures | Auth controller + mongoose import errors |

### High

| Item | Description |
|------|-------------|
| No `permissionGuard` | Documented in README, not implemented |
| No refresh/logout/session management | JWT plugin supports refresh; module does not expose it |
| Events system unwired | Loader disabled, registry never called, queue dependency not enforced |
| Orphaned plugins shipped in template | realtime, presence, rate-limit, logger, multitenancy in every generated project |
| No storage layer | Type declarations reference undefined `CloudinaryService` |
| No conditional env validation | `DATABASE_URL` and Redis required even when unused |
| No production build pipeline | Missing `build`/`start` scripts |
| No Prisma init migration in CLI assets | Fresh PG projects require manual `migrate` with running DB |
| `plugin:add` script broken in generated apps | References `tsx` which is not in generated devDependencies |
| No CHANGELOG or migration guide | Upgrade path undefined |

### Medium

| Item | Description |
|------|-------------|
| `CacheService.flush()` uses `KEYS` | Blocking O(N) Redis operation |
| Cross-module repository imports | Auth → User repository coupling |
| Duplicate `auth.repository.ts` | Dead copy of `UserRepository` |
| `services.ts` entirely commented out | Type augmentation contract broken |
| Metrics module vs Prometheus metrics | Naming confusion; stub CRUD module |
| `HealthService`/`HealthController` unused | Dead code; routes inline |
| Worker config duplication | `bootstrap/config.ts` vs `config/index.ts` |
| Jest haste map collisions | Nested `package.json` in plugins + `packages/` not ignored |
| `composeProject` ignores `plugins` param | Plugin selection only affects deps/env, not source tree |
| README Phase 2 listed as "planned" | Redis, queues, events, WebSockets already in codebase |
| `METRICS_ENABLED`, `QUEUE_PREFIX` env vars | Declared in `.env.example`, never read |
| No request ID propagation to workers | Observability gap |

### Low

| Item | Description |
|------|-------------|
| `pino-pretty` in production dependencies | Should be devDependency |
| Stale `.gitignore` entry in template | `/packages/create-techunico-app/template` leaked |
| `user.id as unknown as string` coercion | Should use `String(user.id)` |
| Default `user` role has no permissions in seed | RBAC exists but empty for normal users |
| `console.log` in events plugin | Should use structured logger |
| `driver` user type in JWT | No module or route uses it |

---

## Dead Code Audit

### Unused Files

| File | Reason |
|------|--------|
| `src/modules/auth/auth.repository.ts` | Duplicate of `UserRepository`; `AuthService` uses `user.repository.ts` |
| `src/plugins/db-prisma/prisma.adapter.ts` | Inline adapter used instead |
| `src/plugins/logger.plugin.ts` | Not registered; Fastify logger used directly |
| `src/plugins/redis/index.ts` | Alternate registry never imported |
| `src/plugins/multitenancy/tenancy.service.ts` | Entirely commented out |
| `src/modules/health/health.service.ts` | Not used by health routes |
| `src/modules/health/health.controller.ts` | Not used by health routes |
| `src/middleware/rate-limit.ts` | Not applied to any route; requires nonexistent `tenantId` |

### Unreachable Code

| Code | Reason |
|------|--------|
| `loadEventListeners()` call | Commented out in `app.ts:22` |
| `registerEventListeners()` | Defined in `event.registry.ts`, never called |
| `send-welcome-email.listener.ts` | Never registered at runtime |
| `UserController.createUser()` | Commented out |
| `realtime.plugin.ts` connection handler before auth | Socket connects unauthenticated before `io.use()` |

### Obsolete / Stale Implementations

| Item | Detail |
|------|--------|
| `fastify.d.ts` `cloudinary` property | Type references undefined `CloudinaryService` |
| `fastify.d.ts` `prisma` property | Decoration removed from plugin |
| `types/services.ts` | Entirely commented out; exports empty `BaseServices` |
| README `request.services.prisma` | Service never existed |
| `src/modules/metrics/` CRUD module | Stub returning `[]`; unrelated to Prometheus |

### Duplicate Implementations

| Duplicates | Locations |
|------------|-----------|
| `UserRepository` class | `user.repository.ts` and `auth.repository.ts` |
| `DatabaseAdapter` interface | `core/interfaces/database.ts` and inline in `prisma.plugin.ts` |
| Config loading | `config/env.ts` and `bootstrap/config.ts` |
| Plugin registry | `plugins/index.ts` and `redis/index.ts` |

---

## Documentation Gaps

| Document | Issue |
|----------|-------|
| `README.md` | Claims `permissionGuard` exists — it does not |
| `README.md` | Documents `request.services.prisma` — does not exist |
| `README.md` | Lists Phase 2 (Redis, WebSockets, events, jobs) as "planned" — implemented but unwired |
| `README.md` | Claims "Guards (auth + permission)" — only `authGuard` exists |
| `README.md` | Claims "Production Ready" — contradicted by broken auth, health, tests |
| `packages/create-techunico-app/README.md` | Also lists Phase 2 as future |
| `packages/create-techunico-app/README.md` | Claims "Production-ready by default" — no build/start, unsafe secrets |
| Generated template README | Missing migrate/seed steps for PostgreSQL |
| No plugin documentation | Which plugins exist, how to enable, dependency chain |
| No auth documentation | Refresh/logout not documented because not implemented |
| No storage documentation | N/A — feature absent |
| No worker documentation | Workers exist but no startup instructions |
| No CHANGELOG | Version history absent |
| No migration guide | Framework upgrade path undefined |
| No contributor guide | Module boundary rules, overlay sync workflow undocumented |
| `.env.example` | Documents `METRICS_ENABLED`, `QUEUE_PREFIX` — unused in code |

---

## Test Coverage Gaps

### Current State

| Metric | Value |
|--------|-------|
| Test files | 1 (`tests/health.test.ts`) |
| Test cases | 1 |
| Passing runs | 0 (suite fails to load) |
| Coverage config | None |
| CLI integration test | `test-compose.js` — structure + install + typecheck |
| CI configuration | None observed |

### Required Before v1

| Layer | What Should Be Tested |
|-------|----------------------|
| **Unit** | `authGuard`, JWT sign/verify/refresh, `CacheService`, `RateLimitService`, `validation.middleware`, `AppError` mapping |
| **Integration** | `buildApp()` boot with plugin combinations (redis, cache, queue, events) |
| **Contract** | Auth register/login/me flow, error envelope shape, validation error details |
| **Health** | `/health` 200, `/ready` 200/503 with mocked DB/Redis |
| **CLI e2e** | Generate PG project → install → generate → typecheck → boot smoke |
| **CLI e2e** | Generate Mongo project → install → typecheck → boot smoke |
| **Overlay parity** | Assert `src/` behavior matches overlay behavior post-generation |
| **Worker** | Enqueue job → worker processes → side effect |
| **Regression** | `env.ts` test defaults, `services.plugin.ts` wiring, JWT sign arity |

### Test Infrastructure Fixes Needed

- Fix `src/config/env.ts` test defaults (`DB_PROVIDER`, `REDIS_HOST`, `REDIS_PORT`)
- Add `testPathIgnorePatterns` for `packages/` and nested plugin `package.json`
- Add `setupFiles` or `globalSetup` for test env isolation
- Consider separate jest project for CLI tests

---

## Release Checklist

### Framework Source Integrity

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes with zero failures
- [ ] `src/` aligned with overlay patches (or overlays generated from `src/` automatically)
- [ ] `request.services.auth` wired in `services.plugin.ts`
- [ ] `auth.controller.ts` uses `jwt.sign(payload, "user", "access")`
- [ ] `app.db` is sole DB accessor; `app.prisma` removed from types and all consumers
- [ ] `/ready` uses adapter-agnostic health check; Redis check is conditional
- [ ] `permissionGuard` implemented and applied to protected routes
- [ ] Auth routes: `/refresh`, `/logout` implemented
- [ ] JWT secrets from env only; no hardcoded fallbacks
- [ ] `jwt.verify` uses explicit algorithm allowlist; no decode-before-verify

### CLI & Project Generation

- [ ] `node test-compose.js` passes for PostgreSQL and MongoDB
- [ ] Generated project boots with `npm run dev` after CLI (smoke test in CI)
- [ ] `build` and `start` scripts in generated `package.json`
- [ ] Random `JWT_SECRET` generated at project creation
- [ ] Initial Prisma migration bundled in CLI assets
- [ ] `postinstall: prisma generate` in generated PostgreSQL projects
- [ ] WebSocket CLI option wires `realtime` plugin (or option removed)
- [ ] Queue selection enforces Redis selection in CLI prompts
- [ ] `plugin:add` script works or is removed from generated projects
- [ ] `.gitignore` template cleaned of framework-internal paths
- [ ] `build-template` syncs full Prisma asset bundle (schema + seed + config template)

### Plugin Ecosystem

- [ ] Plugin manifest with dependency resolution
- [ ] `events` registration checks `queue` dependency
- [ ] Orphaned plugins either registered or removed from template
- [ ] Event listeners auto-registered when events plugin enabled
- [ ] Worker entrypoint: `npm run workers`
- [ ] Realtime plugin uses `app.jwt` for verification (not raw `config.jwt.secret`)

### Security

- [ ] Access token TTL ≤ 15m (verified on login path)
- [ ] Rate limiting on `/auth/login` and `/auth/register`
- [ ] User routes protected with `authGuard` + `permissionGuard`
- [ ] `@fastify/helmet` or equivalent security headers
- [ ] No default weak secrets in generated `.env`

### Storage

- [ ] Storage plugin with interface + local adapter (minimum)
- [ ] Remove or implement `cloudinary` type in `fastify.d.ts`

### Configuration

- [ ] Conditional env validation per `DB_PROVIDER`
- [ ] Redis env vars required only when redis plugin enabled
- [ ] `MONGO_URI` in env schema for MongoDB path
- [ ] Remove or implement unused env vars (`METRICS_ENABLED`, `QUEUE_PREFIX`)

### Documentation

- [ ] README reflects actual feature set
- [ ] Remove `permissionGuard` from docs until implemented (or implement it)
- [ ] Auth docs: register, login, refresh, logout, guards
- [ ] Plugin docs: enablement, dependencies, experimental flags
- [ ] CLI docs: full flow including migrate/seed for PostgreSQL
- [ ] CHANGELOG.md with semver policy
- [ ] v1 migration guide

### Testing

- [ ] Auth flow integration tests
- [ ] Error handler tests (Zod, AppError, 500 masking)
- [ ] Plugin gating integration tests
- [ ] CLI e2e in CI
- [ ] Coverage threshold defined (recommend ≥60% on `core/` and `modules/auth/`)

---

## Future Roadmap

### v1 Blockers

These must be completed before v1 release approval:

| # | Item | Effort |
|---|------|--------|
| 1 | Align `src/` with overlay fixes (DI, auth controller, health routes, env schema) | S |
| 2 | Fix `app.db` migration — update all `app.prisma` consumers | M |
| 3 | Implement `permissionGuard` and protect routes | S |
| 4 | Complete auth lifecycle: refresh endpoint, dual tokens on login | M |
| 5 | Fix JWT security: env-only secrets, remove decode-before-verify | S |
| 6 | Fix test infrastructure (`env.ts` defaults, jest config) | S |
| 7 | Auth + health integration tests with passing CI | M |
| 8 | Conditional env validation in `env.schema.ts` | S |
| 9 | Add `build`/`start` scripts to generated projects | S |
| 10 | Bundle initial Prisma migration in CLI assets | M |
| 11 | Generate random `JWT_SECRET` at project creation | S |
| 12 | Fix or remove WebSocket CLI option | S |
| 13 | Enforce events → queue → redis dependency chain | S |
| 14 | Update README and CLI docs to match implementation | S |
| 15 | Add CHANGELOG.md | S |

### v1.1 Improvements

Acceptable immediately after v1 with 30-day target:

| # | Item |
|---|------|
| 1 | Session model + refresh token rotation + logout |
| 2 | Token versioning on role/permission changes |
| 3 | Register orphaned plugins (realtime, presence, rate-limit) with `experimental` flag |
| 4 | Event listener auto-registration + worker entrypoint |
| 5 | Storage plugin MVP (local + S3 or Cloudinary) |
| 6 | Auth route rate limiting |
| 7 | `CacheService.flush()` → `SCAN` instead of `KEYS` |
| 8 | `postinstall: prisma generate` safety net |
| 9 | `techunico.version` file in generated projects |
| 10 | Expand test suite (plugins, queues, CLI e2e) |
| 11 | Queue metrics export |
| 12 | Account lockout via Redis |

### v2 Roadmap

Larger architectural investments — not v1 blockers:

| # | Item |
|---|------|
| 1 | Extract `@techunico/framework-core` npm package |
| 2 | `techunico doctor` compatibility checker |
| 3 | `techunico upgrade` codemod CLI |
| 4 | Full multitenancy (resolver, `ctx.tenant`, scoped queries) |
| 5 | Socket.io Redis adapter for horizontal scaling |
| 6 | OpenTelemetry plugin |
| 7 | OpenAPI generation |
| 8 | Social authentication plugin |
| 9 | npm package ecosystem for optional plugins (`@techunico/plugin-storage`) |
| 10 | SQLite as CLI option for local development |
| 11 | GraphQL module template |
| 12 | Separate `REDIS_CACHE_URL` / `REDIS_QUEUE_URL` |

---

## Final Verdict

### Would I approve this release as Lead Architect?

**No.**

### What must be completed before approving v1

**Non-negotiable gate items:**

1. **Framework source must pass its own quality gates** — `typecheck` and `test` green
2. **Auth must work end-to-end in `src/`** — DI wired, login tokens valid for `authGuard`, not just in overlays
3. **`app.db` migration complete** — no remaining `app.prisma` references; health probes functional
4. **`permissionGuard` implemented** — RBAC must be enforceable, not decorative
5. **JWT security baseline** — no hardcoded secrets, no decode-before-verify, explicit algorithms
6. **Conditional env validation** — MongoDB projects must not require `DATABASE_URL`; optional Redis must not require Redis env vars
7. **CLI produces production-capable projects** — `build`/`start` scripts, safe secrets, migrate/seed documented and testable
8. **Integration tests** — auth flow, health/readiness, CLI smoke test in CI
9. **Documentation accuracy** — README must not claim features that fail at runtime
10. **Plugin dependency correctness** — events requires queue; WebSocket CLI option must work or be removed

**Strongly expected at v1 (or v1.1 within 30 days with explicit deferral documented):**

- Refresh/logout endpoints
- Storage plugin MVP
- Event system activation
- Worker entrypoint
- Orphaned plugins registered or removed from template

### Assessment

The framework has the **hard architectural pieces** — modular monolith, plugin composition, dual database support, CLI overlays, Prisma 7 bootstrap, observability hooks, queue infrastructure, and RBAC schema. The CLI path has improved significantly and generated projects typecheck.

What remains is **platform glue and release discipline**: the canonical `src/` tree must match what the CLI ships, documented APIs must work at runtime, security must meet baseline expectations, and tests must catch regressions before they replicate into every Techunico product.

**Estimated effort to v1 approval: 3–5 weeks** of focused execution on the v1 blocker list — not a rewrite, but a coherence and integration sprint.

The right decision is to **hold the v1 release** until the framework source passes its own tests and a new developer can `create-techunico-app my-api → install → migrate → dev → register → login → me` without manual fixes.

---

*Audit conducted against the Techunico Node Framework codebase on June 29, 2026. All findings verified against source files and command execution.*