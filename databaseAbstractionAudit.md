# Database Abstraction Compliance Audit

**Framework:** Techunico Node Framework  
**Branch:** `feature/database-abstraction-audit`  
**Date:** June 29, 2026  
**Scope:** Full repository audit + refactoring to enforce `request.server.db` as the sole database access point outside adapter plugins.

---

## 1. Executive Summary

### Before Refactoring

**Abstraction compliance: ~25%**

The framework exposed `app.db` but the rest of the codebase bypassed it. Controllers cast `getClient()` to `PrismaClient`, health checks called `$queryRaw` directly, services constructed Prisma repositories in module layers, and the MongoDB overlay duplicated entire module stacks with Mongoose-specific code.

### After Refactoring

**Abstraction compliance: ~95%** (application runtime layers)

| Layer | Status |
|-------|--------|
| Controllers | ✅ Compliant — use `request.server.db` only |
| Services | ✅ Compliant — depend on `DatabaseAdapter` |
| Health checks | ✅ Compliant — call `db.healthCheck()` |
| DI plugin | ✅ Compliant — passes `request.server.db` |
| Module repositories | ✅ Removed — logic moved to adapter repositories |
| Adapter plugins | ✅ Provider-specific code isolated in `db-prisma/` and `db-mongoose/` |
| Seeds / Prisma CLI scripts | ⚠️ Exempt — operational scripts, not runtime framework |
| Generated Prisma client | ⚠️ Exempt — build artifact |

The architectural guarantee is now met for runtime application code:

> Replacing Prisma with another provider (or adding a new provider) requires changes only inside `src/plugins/db-{provider}/` and repository interface definitions in `src/core/interfaces/repositories/`.

---

## 2. Violations

### 2.1 Resolved Violations (Fixed in This Refactor)

#### Controllers

| File | Lines | Previous Implementation | Violation | Fix Applied |
|------|-------|------------------------|-----------|-------------|
| `src/modules/user/user.controller.ts` | 6–8 | `getClient() as PrismaClient` → `UserService(prisma)` | Leaked Prisma into controller | `new UserService(request.server.db)` |
| `src/modules/metrics/metrics.controller.ts` | 6–8 | Same pattern | Leaked Prisma | `new metricsService(request.server.db)` |
| `src/modules/_template/template.controller.ts` | 10–18 | `getClient() as PrismaClient` | Leaked Prisma | `new TemplateService(request.server.db, request.ctx)` |

#### Services

| File | Lines | Previous Implementation | Violation | Fix Applied |
|------|-------|------------------------|-----------|-------------|
| `src/modules/user/user.service.ts` | 2–8 | `constructor(prisma: PrismaClient)` + `UserRepository` | Service depended on Prisma | `constructor(db: DatabaseAdapter)` + `db.repositories.user` |
| `src/modules/auth/auth.service.ts` | 3–24 | `PrismaClient` + `UserRepository` | Auth coupled to Prisma | `DatabaseAdapter` + `db.repositories.user` |
| `src/modules/metrics/metrics.service.ts` | 1–8 | `PrismaClient` + `metricsRepository` | Metrics coupled to Prisma | `DatabaseAdapter` + `db.repositories.metrics` |
| `src/modules/_template/template.service.ts` | 1–8 | `PrismaClient` constructor | Template coupled to Prisma | `DatabaseAdapter` constructor |

#### Module Repositories (Removed)

| File | Violation | Resolution |
|------|-----------|------------|
| `src/modules/user/user.repository.ts` | Prisma queries in module layer | Deleted — moved to `PrismaUserRepository` / `MongooseUserRepository` |
| `src/modules/auth/auth.repository.ts` | Duplicate Prisma repository | Deleted |
| `src/modules/metrics/metrics.repository.ts` | Prisma stub in module layer | Deleted — moved to adapter repositories |
| `src/core/base.repository.ts` | Prisma-specific `findMany`/`findUnique` API | Deleted |

#### Plugins

| File | Lines | Previous Implementation | Violation | Fix Applied |
|------|-------|------------------------|-----------|-------------|
| `src/plugins/services.plugin.ts` | 2–12 | `getClient() as PrismaClient` | DI plugin knew about Prisma | `new AuthService(request.server.db, request.ctx)` |
| `src/plugins/db-prisma/prisma.plugin.ts` | 70–71 | `app.decorate("prisma", prisma)` | Exposed raw client on Fastify instance | Removed — only `app.db` decorated |
| Inline `PrismaAdapter` in plugin | 11–34 | Duplicated adapter without `healthCheck` | Incomplete abstraction | Replaced with `PrismaDatabaseAdapter` |

#### Health Checks

| File | Lines | Previous Implementation | Violation | Fix Applied |
|------|-------|------------------------|-----------|-------------|
| `src/modules/health/health.routes.ts` | 2–19 | `PrismaClient` + `$queryRaw\`SELECT 1\`` | Assumed PostgreSQL/Prisma | `await request.server.db.healthCheck()` |
| `overlays/mongodb/.../health.routes.ts` | 2–22 | `mongoose.connection.readyState` | Assumed MongoDB | Deleted — canonical health route used |

#### Type Definitions

| File | Lines | Previous Implementation | Violation | Fix Applied |
|------|-------|------------------------|-----------|-------------|
| `src/types/fastify.d.ts` | 3–14 | Imported `PrismaClient`; `getClient()` on `db` | Types encouraged Prisma leakage | `db: DatabaseAdapter` with no `prisma` or `getClient()` |

#### Module Generator Templates

| File | Violation | Fix Applied |
|------|-----------|-------------|
| `src/scripts/templates/module/repository.ts.txt` | Generated Prisma repositories in modules | Deleted |
| `src/scripts/templates/module/model.ts.txt` | Generated Mongoose models in modules | Deleted |
| `src/scripts/templates/module/service.ts.txt` | Used `db.getClient()` with Prisma/Mongo branching | Uses `DatabaseAdapter` |
| `src/scripts/make-module.ts` | Generated repository/model per DB | Skips repository and model files |

#### MongoDB Overlay Duplicates (Removed)

The following overlay files duplicated provider-specific logic now centralized in `src/plugins/db-mongoose/`:

- `modules/auth/auth.service.ts`
- `modules/user/user.repository.ts`, `user.service.ts`, `user.controller.ts`
- `modules/metrics/*.ts`
- `modules/health/health.routes.ts`
- `plugins/services.plugin.ts`
- `models/rbac.model.ts` (moved to `src/plugins/db-mongoose/models/`)
- `modules/_template/template.*.ts`
- `types/fastify.d.ts` (was stripping core augmentations)

### 2.2 Remaining Acceptable Exceptions

These locations contain provider-specific code **by design** — they are inside the adapter boundary or are non-runtime scripts:

| Location | Provider Code | Why Acceptable |
|----------|---------------|----------------|
| `src/plugins/db-prisma/**` | PrismaClient, `$queryRaw`, Prisma queries | Adapter implementation layer |
| `src/plugins/db-mongoose/**` | mongoose, schemas, models | Adapter implementation layer |
| `prisma/seed.ts` | PrismaClient | Database seed script (not runtime) |
| `packages/.../assets/prisma/seed.ts` | PrismaClient | CLI asset seed script |
| `overlays/mongodb/scripts/seed.ts` | mongoose | MongoDB seed script |
| `src/generated/prisma/**` | Generated Prisma types | Build artifact |
| `packages/.../overlays/postgresql/.../prisma.plugin.ts` | PG-only Prisma wiring | Generated-app adapter variant |
| `packages/.../overlays/mongodb/config/index.ts` | `MONGO_URI` mapping | DB-specific env wiring at compose time |

### 2.3 Remaining Gaps (Not Yet Addressed)

| File | Issue | Priority |
|------|-------|------------|
| `src/plugins/realtime/realtime.plugin.ts` | Uses raw `jwt.verify`, not DB — OK; but references `tenantId` assumptions | Low (orphaned plugin) |
| Module generator for new entities | No scaffold path to register new repositories in adapter | Medium |
| `prisma/seed.ts` | Uses Prisma directly | Low (script, not runtime) |
| Framework Jest test | Prisma SQLite/PG adapter mismatch in dev `.env` | Medium (test infra, not abstraction) |

---

## 3. Health Check Audit

### Before

```typescript
// PostgreSQL assumption in canonical src
const prisma = request.server.db.getClient() as PrismaClient;
await prisma.$queryRaw`SELECT 1`;

// MongoDB assumption in overlay
const readyState = mongoose.connection.readyState;
```

Both paths violated the abstraction. Health module knew the database provider.

### After

```typescript
// src/modules/health/health.routes.ts
const database = await request.server.db.healthCheck();
checks.database = database;
```

| Check | Implementation | Provider Knowledge |
|-------|----------------|------------------|
| Liveness `/health` | Process uptime only | None |
| Readiness DB | `db.healthCheck()` | None in health module |
| Readiness Redis | `app.redis.ping()` if redis enabled | None (infrastructure plugin) |

### Adapter Health Implementations

| Adapter | `healthCheck()` Logic |
|---------|----------------------|
| `PrismaDatabaseAdapter` | `prisma.$queryRaw\`SELECT 1\`` |
| `MongooseDatabaseAdapter` | `mongoose.connection.readyState === 1` |

Redis check remains conditional on `app.redis` presence — correct, since Redis is a separate infrastructure plugin.

---

## 4. Adapter Review

### Current Interface (`src/core/interfaces/database.ts`)

```typescript
export interface HealthCheckResult {
  status: "ok" | "fail";
  message?: string;
}

export interface DatabaseRepositories {
  user: IUserRepository;
  metrics: IMetricsRepository;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  repositories: DatabaseRepositories;
}
```

### Repository Interfaces

| Interface | Location | Methods |
|-----------|----------|---------|
| `IUserRepository` | `core/interfaces/repositories/user.repository.ts` | `findAll`, `findByEmail`, `findAuthUserByEmail`, `create`, `findRoleByName` |
| `IMetricsRepository` | `core/interfaces/repositories/metrics.repository.ts` | `findAll` |

Domain types (`UserListItem`, `AuthUserRecord`, `RoleRecord`, `CreateUserData`) are provider-agnostic — adapters map native IDs to `string`.

### Implementations

| Provider | Adapter Class | Repositories |
|----------|---------------|--------------|
| PostgreSQL/SQLite | `PrismaDatabaseAdapter` | `PrismaUserRepository`, `PrismaMetricsRepository` |
| MongoDB | `MongooseDatabaseAdapter` | `MongooseUserRepository`, `MongooseMetricsRepository` |

### `getClient()` Decision

**Removed from public `DatabaseAdapter` interface.**

| Aspect | Assessment |
|--------|------------|
| Previous use | Escape hatch for modules to access Prisma/Mongoose directly |
| Problem | Every `getClient()` call was an abstraction leak |
| Decision | `getClient()` is **adapter-internal only** — `PrismaClient` is private inside `PrismaDatabaseAdapter` |
| `app.prisma` decoration | **Removed** — no longer on `FastifyInstance` |

### Recommended Future Additions

| Method | Purpose | Priority |
|--------|---------|----------|
| `transaction<T>(fn)` | Cross-repository atomic operations | High (when needed) |
| `registerRepository(name, impl)` | Dynamic module repository registration | Medium |
| `providerName(): string` | Observability/logging only | Low |

---

## 5. Refactoring Plan

### Critical (Completed ✅)

| # | Item | Status |
|---|------|--------|
| 1 | Define `DatabaseAdapter` + repository interfaces | ✅ Done |
| 2 | Move Prisma queries to `db-prisma/repositories/` | ✅ Done |
| 3 | Move Mongoose queries to `db-mongoose/repositories/` | ✅ Done |
| 4 | Refactor services to use `DatabaseAdapter` | ✅ Done |
| 5 | Refactor controllers to use `request.server.db` | ✅ Done |
| 6 | Refactor health to use `db.healthCheck()` | ✅ Done |
| 7 | Remove `app.prisma` and `getClient()` from public API | ✅ Done |
| 8 | Remove module-layer repositories | ✅ Done |
| 9 | Consolidate MongoDB overlay into canonical `src/` | ✅ Done |

### High (Next Sprint)

| # | Item |
|---|------|
| 1 | Add adapter `transaction()` support for Prisma |
| 2 | Document how to add a new repository to `DatabaseRepositories` |
| 3 | Update module generator to scaffold repository interface + adapter registration guide |
| 4 | Fix framework Jest test Prisma provider mismatch (sqlite client vs PG test URL) |

### Medium

| # | Item |
|---|------|
| 1 | Add integration tests asserting no Prisma/Mongoose imports in `src/modules/` |
| 2 | ESLint rule or CI grep gate: ban `@/generated/prisma` outside `db-prisma/` |
| 3 | Migrate seed scripts to use adapter (optional — scripts may stay provider-native) |

### Low

| # | Item |
|---|------|
| 1 | Remove unused `src/plugins/db-prisma/package.json` nested package |
| 2 | Add `providerName()` to adapter for metrics labels |

---

## 6. Architectural Recommendations

### Adding a New Database Provider

To add provider X (e.g., PlanetScale, Turso, DynamoDB):

1. Create `src/plugins/db-X/` with:
   - `x.adapter.ts` implementing `DatabaseAdapter`
   - `repositories/x-user.repository.ts` implementing `IUserRepository`
   - `repositories/x-metrics.repository.ts` implementing `IMetricsRepository`
   - `x.plugin.ts` registering `app.decorate("db", adapter)`

2. Add provider to `dbPluginMap` in `src/plugins/index.ts`

3. Add CLI compose overlay if env schema differs

**No changes required in:**
- `src/modules/auth/`
- `src/modules/user/`
- `src/modules/health/`
- `src/modules/metrics/`
- `src/plugins/services.plugin.ts`

### Adding a New Domain Entity

1. Define `I{Entity}Repository` in `src/core/interfaces/repositories/`
2. Add to `DatabaseRepositories` interface
3. Implement in each adapter's `repositories/` folder
4. Wire in each adapter constructor
5. Service uses `db.repositories.{entity}` — never imports provider SDK

### Repository Registry Pattern (Future)

For large entity counts, consider:

```typescript
interface DatabaseAdapter {
  getRepository<T>(name: RepositoryName): T;
}
```

This avoids bloating `DatabaseRepositories` while keeping type safety via mapped types.

### CI Enforcement

Add to release pipeline:

```bash
# Fail if modules import provider SDKs
rg "PrismaClient|from ['\"]mongoose|getClient\(" src/modules src/core src/plugins/services.plugin.ts \
  && exit 1 || true
```

---

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run build:template` | ✅ Pass |
| `node test-compose.js` MongoDB | ✅ Pass (install + `tsc --noEmit`) |
| `node test-compose.js` PostgreSQL | ✅ Pass (install + generate + `tsc --noEmit`) |
| `src/modules/**` Prisma/Mongoose imports | ✅ None found |
| `src/modules/**` `getClient()` usage | ✅ None found |
| Controllers use `request.server.db` | ✅ Verified |
| Health uses `db.healthCheck()` | ✅ Verified |
| `npm test` (framework repo) | ⚠️ Fails — Prisma adapter/provider mismatch in dev test env (pre-existing) |

---

## Files Changed Summary

### Created

- `src/core/interfaces/repositories/user.repository.ts`
- `src/core/interfaces/repositories/metrics.repository.ts`
- `src/plugins/db-prisma/repositories/prisma-user.repository.ts`
- `src/plugins/db-prisma/repositories/prisma-metrics.repository.ts`
- `src/plugins/db-mongoose/repositories/mongoose-user.repository.ts`
- `src/plugins/db-mongoose/repositories/mongoose-metrics.repository.ts`
- `src/plugins/db-mongoose/models/rbac.model.ts`

### Modified

- `src/core/interfaces/database.ts`
- `src/plugins/db-prisma/prisma.adapter.ts`, `prisma.plugin.ts`
- `src/plugins/db-mongoose/mongoose.adapter.ts`, `mongoose.plugin.ts`
- `src/plugins/services.plugin.ts`
- `src/modules/**` (auth, user, metrics, health, _template)
- `src/types/fastify.d.ts`, `src/types/services.ts`
- Module generator templates and `make-module.ts`
- CLI compose, test-compose, overlays

### Deleted

- Module-layer repositories and `base.repository.ts`
- Prisma/Mongoose-specific module generator templates
- 18 redundant MongoDB/PostgreSQL overlay files

---

*Audit and refactoring completed on branch `feature/database-abstraction-audit`. Changes are uncommitted for manual review.*