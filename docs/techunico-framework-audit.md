# Techunico Node Framework — Architecture Audit & Gap Analysis

Audit date: 2026-10-19 · Commit audited: `514b02c` (main) + one uncommitted change (`packages/create-techunico-app/package.json` 0.3.4 → 0.4.0)
Mode: read-only. No project files were modified, no dependencies installed. All reproductions ran in a scratch directory outside the repo.

---

## 0. Executive summary

The framework has good building blocks: Fastify 5, Zod, a Prisma/Mongoose adapter split, and well-structured Geo / Cloudinary / Payment plugins with typed errors and provider adapters. The template-composition idea (base template + per-DB overlays) is sound. **But today the end-to-end product does not work for a new user, and two security defects affect every generated app.**

Five headline problems:

1. **The published CLI cannot run.** `@techunico/node-framework@0.4.0` declares no dependencies, so `npx` fails with `Cannot find module 'inquirer'` (reproduced outside the repo).
2. **Generated apps cannot start.** Optional plugins are imported statically, so a fresh PostgreSQL or MongoDB app crashes at boot with `Cannot find module 'ioredis'`. Selecting Redis + Queue only moves the failure (`mongoose` for PG, `axios` for Mongo). The CLI's own test hides this because it runs inside the repo and Node resolves the missing packages from the repo's root `node_modules`.
3. **JWT admin tokens can be forged.** `jwt.plugin.ts` uses a hardcoded `"secret_admin"` and picks the verification key from the *unverified* `userType` claim. A self-signed admin token passes `verifyAccess` (verified with the real `jsonwebtoken`).
4. **Every generated app ships a publicly known `JWT_SECRET`** (`SUPERSECURESECRET`). It passes validation, and because npm strips `template/.gitignore`, the generated `.env` is not git-ignored.
5. **There is no working quality gate.** `npm run typecheck` runs out of memory (>10 GB) because of `core/register-model.ts`, the only test fails at env validation, and there is no CI.

The main structural issue sits underneath these: **there is no framework runtime package.** `@techunico/node-framework` is the CLI. The entire framework `src/` is *copied* into each app and then partly overwritten by 26 hand-maintained overlay files. So (a) fixes such as #3 cannot reach existing apps, and (b) the repo's own `src/` is not the code users actually run: the PostgreSQL overlay is an outdated fork that silently drops the Geo, Cloudinary and Payment plugins.

Findings: **5 × P0, 13 × P1, 11 × P2, 3 × P3** (§10).

---

## Verification log (what was actually run)

| Check | Command / method | Result |
|---|---|---|
| Framework type-check | `npx tsc --noEmit` (default heap, then `--max-old-space-size=10240`) | **OOM crash both times** (exit 134) |
| Isolate OOM | `tsc` on single files | `src/core/register-model.ts` alone → OOM; `mongoose.adapter.ts` alone → OK |
| Framework tests | `npx jest --ci` | **1 suite failed, 0 tests ran**: `Invalid environment variables` |
| Generated PG app boot (current template, out of repo) | `compose-run.js` reproduces `index.js` + `composeProject`; deps = exactly what CLI declares | `Cannot find module 'ioredis'` |
| Generated Mongo app boot | same | `Cannot find module 'ioredis'` |
| …with ioredis + bullmq added | same | PG: `Cannot find module 'mongoose'` (via `core/model-loader.ts`); Mongo: `Cannot find module 'axios'` (via `plugins/geo`) |
| Generated app `tsc` | `tsc --noEmit` | Both: `TS2688 Cannot find type definition file for 'jest'`. With `--types node`: PG 32 errors, Mongo OOM |
| Why CLI test passes | `require.resolve` inside `.test-output/*` | `ioredis`, `bullmq`, `cloudinary`, `razorpay`, `axios`, `geolib` resolve from **repo root** `node_modules` |
| Published CLI | copy of package run outside repo; `npm view` | `Cannot find module 'inquirer'`; registry shows 0.4.0 with **no `dependencies`** |
| Package contents | `npm pack --dry-run` | `template/.gitignore` **excluded**; `.env.example` included; `.test-output` excluded |
| JWT forgery | Node script using installed `jsonwebtoken` + the plugin's `getSecret` logic | Forged `{role:"admin", userType:"admin", tokenType:"access"}` signed with `secret_admin` → **accepted** |
| `jwt.sign` without tokenType (root `auth.controller.ts`) | same | **throws** `"expiresIn" should be a number…` → root login is broken |

Scratch artifacts: `/private/tmp/claude-501/-Users-praveenkumar-Documents-projects-praveen-nodejs-framework/c7ffd1e4-2fbe-4494-bead-f2f75629e634/scratchpad/` (`gen/pg`, `gen/mongo`, `compose-run.js`, `tsc-*.txt`).

Not verified: anything that needs a live PostgreSQL, MongoDB, Redis, Razorpay, Google or Cloudinary. No external client project is in this repo, so none was inspected. `docs/framework-plugin-audit-and-design.md` scores "client" plugins, but that code is not here.

---

## 1. Repository map (as it actually exists)

```
nodejs_framework/                     ← root package "nodejs_framework" (private dev harness, not published)
├── src/                              ← framework source AND the template source (same tree)
│   ├── server.ts, app.ts             entry + buildApp()
│   ├── config/ {app,env,env.schema,index,logger}.ts, bootstrap/config.ts   (3 config paths)
│   ├── core/                         error handler, auth guard, validation, module/model loaders,
│   │                                 register-model (Mongo), base.repository (Prisma-only), metrics
│   ├── plugins/                      core: jwt, response, context, services, metrics, logger(unused)
│   │   ├── db-prisma/, db-mongoose/  DB plugins (+ fake sub-package package.json files)
│   │   ├── redis, cache, queue, events          optional, PLUGINS-driven
│   │   ├── geo/, cloudinary/, payment/          optional, newest, best-structured
│   │   └── realtime, presence, rate-limit, multitenancy   never registered (dead/experimental)
│   ├── modules/ {auth,user,health,metrics,_template}   sample app modules (auto-loaded)
│   ├── events/, queues/, streaming/, middleware/        partially wired / dead
│   ├── scripts/ build-template.ts (tooling), add-plugin.ts (tooling), make-module.ts (+ templates/)
│   ├── types/                        fastify.d.ts augmentation, request-context, services
│   └── generated/prisma              gitignored Prisma client output
├── prisma/  schema.prisma, schema.postgresql.prisma, schema.sqlite.prisma, migrations_sqlite/, seed.ts, starter/prisma.config.ts
├── prisma.config.ts                  root dev config (postgresql|sqlite switch)
├── tests/health.test.ts              the only test
├── dev.db                            committed SQLite database
├── docs/ + 3 root *.md reports       earlier analyses
└── packages/create-techunico-app/    ← published as @techunico/node-framework (the CLI)
    ├── index.js                      interactive generator (inquirer)
    ├── lib/compose.js                DB composition: remove artifacts, apply overlay, env, package.json
    ├── template/                     GENERATED by build:template, gitignored, published
    ├── overlays/postgresql (9 files), overlays/mongodb (17 files)   hand-maintained, tracked
    ├── assets/prisma/                synced by build:template, tracked
    ├── test-compose.js               composition smoke test (not wired into any script)
    └── .test-output/                 stale generated apps from 2026-06-29 (untracked)
```

### End-to-end lifecycle (traced)

1. **Develop** in `src/` with `npm run dev` (root). With the committed local `.env` (`DB_PROVIDER=sqlite`) this throws `Unsupported DB provider: sqlite` (`src/plugins/index.ts:35`), and several root `src` paths are broken anyway (F-08).
2. **Build template**: `npm run build:template` → `src/scripts/build-template.ts`
   - copies **all of `src/`** → removes only `build-template.ts`, `add-plugin.ts`, `src/generated`
   - copies `tsconfig.json`, `.env.example`, `.gitignore` (repo `.gitignore`, including the repo-specific `/packages/create-techunico-app/template` line)
   - writes `package.json` with scripts filtered from root (`build`/`start` do not exist in root, so the template gets only `dev`, `test`, `make:module`, `plugin:add`)
   - writes a README, copies everything to `packages/create-techunico-app/template/`, syncs Prisma assets.
3. **Publish**: manual `npm publish` from `packages/create-techunico-app` (`files`: index.js, lib, template, overlays, assets). There is no `prepublishOnly`, so whatever is in the gitignored `template/` gets published. npm drops `template/.gitignore`.
4. **Generate**: `npx @techunico/node-framework my-app` → `index.js`: copy template → overwrite deps with a hardcoded list → `composeProject` (PG: delete `db-mongoose`, copy schema/seed/config, apply PG overlay; Mongo: delete Prisma artifacts + 3 repositories, apply Mongo overlay) → create `.env` from `.env.example` → `npm install` → `prisma generate` (PG).
5. **Run**: `npm run dev` (ts-node-dev). There is no `build`/`start` script, so there is no production run path.

---

## 2. Framework ↔ template boundary

The defining fact: **categories A and B are the same directory.** Every framework internal is vendored into every app. That copy is not *required* by the architecture; it is the only delivery mechanism because no runtime package exists.

| Path | Category | Should belong to | Reaches app via | Problem |
|---|---|---|---|---|
| `src/core/*` (error-handler, auth.guard, validation, module-loader, model-loader, register-model, metrics, error-codes) | A | framework runtime | copied | Vendored, so it can't be upgraded. `model-loader`/`register-model` pull `mongoose` into PG apps |
| `src/plugins/{jwt,response,context,services,metrics}` | A | framework runtime | copied; `services` overwritten by both overlays | `services.plugin.ts` is app wiring disguised as framework |
| `src/plugins/db-prisma`, `db-mongoose` | A (DB-specific) | framework runtime, optional per DB | copied, then one is deleted | `prisma.plugin.ts` overwritten in PG overlay; `prisma.adapter.ts` unused; fake `package.json` files |
| `src/plugins/{redis,cache,queue,events,geo,cloudinary,payment}` | A (optional) | framework runtime, optional | always copied, always statically imported | Root cause of boot crash (F-02) |
| `src/plugins/{realtime,presence,rate-limit,multitenancy}`, `streaming/`, `middleware/`, `logger.plugin.ts`, `core/register-modules.ts`, `events/event.loader.ts` | A (dead) | delete or move to `experimental/` | copied | Ship broken code to users (F-24) |
| `src/plugins/index.ts` | A **and** B | framework (registry) + app (selection) | copied, then **overwritten by both overlays** | Three divergent copies; PG copy is stale (F-07) |
| `src/config/*` | B (app config) on top of A (loader) | split: loader in framework, schema in app | copied, `env.ts`/`env.schema.ts` overwritten by both overlays | Root version is wrong for both DBs |
| `src/modules/{auth,user,health,metrics}` | B | template | copied, partly overwritten | Root versions broken (F-08). `health`/`metrics` are really framework routes |
| `src/modules/_template` | B (sample) | template or generator asset | copied; skipped by loader (`_` prefix) | Type errors in PG app |
| `src/models/rbac.model.ts` | B (Mongo) | template (Mongo) | Mongo overlay only | — |
| `src/types/fastify.d.ts` | D (shared contract) | framework (augmentation) + app (services) | copied, overwritten by Mongo overlay | `.d.ts` + `skipLibCheck` means it is never type-checked (F-09) |
| `src/scripts/build-template.ts`, `add-plugin.ts` | C | tooling | excluded by build script | `plugin:add` script still points to the excluded file |
| `src/scripts/make-module.ts` + `templates/` | B/C (app dev tool) | generator tooling shipped to app | copied | Fine to ship. Generates invalid code for kebab-case names |
| `prisma/schema.postgresql.prisma`, `seed.ts`, `starter/prisma.config.ts` | D (synced) | template (PG) | build-template → `assets/prisma` → compose | OK. Sync is one-way and verified identical today |
| `prisma/schema.prisma`, `schema.sqlite.prisma`, `migrations_sqlite/`, root `prisma.config.ts`, `dev.db` | C (dev harness) | dev-only | not shipped | SQLite path is unsupported at runtime; `dev.db` committed |
| `.env.example` | B | template | copied → becomes `.env` | Known JWT secret (F-05) |
| `packages/create-techunico-app/overlays/*` | D (forks of A/B) | should mostly disappear | applied by compose | 26 full-file forks with no drift check (F-07) |
| `packages/create-techunico-app/index.js` dependency list (and a second copy in `test-compose.js`) | D (contract) | single manifest | hardcoded | Drifts from root `package.json` (e.g. mongoose `^8.5.0` vs `^8.24.2`) and from actual imports (F-02) |

**Boundary verdict:** the boundary is "copy everything, then patch". There is no single source of truth for (1) which plugins exist and what they need, (2) the env contract, (3) the DB-specific wiring. Each of the three is duplicated across `src/`, the two overlays and `index.js`.

---

## 3. Framework core — subsystem verdicts

| Subsystem | Verdict | Key evidence |
|---|---|---|
| Fastify lifecycle | ⚠️ | `server.ts` has no SIGTERM/SIGINT handling, so `onClose` hooks never run in containers. `buildApp()` sits outside the try/catch, so a startup failure becomes an unhandled rejection |
| Plugin init order | ⚠️ | Sequential `await app.register` gives deterministic order, but dependencies are enforced only by `if` checks that *warn and continue*. `events` checks redis but needs `queue` |
| Config/env | ❌ | 3 loaders (`config/app.ts`, `config/index.ts`, `bootstrap/config.ts`) plus 4 plugins reading `process.env` directly. dotenv is loaded by import side effect in `server.ts`, so importing `app.ts` directly (tests) fails validation |
| Logging | ⚠️ | pino-pretty in dev. No `redact`. `auth.guard.ts:27` logs the full `Authorization` header. `logger.plugin.ts` unused |
| Request context | ⚠️ | `context.plugin.ts` ignores Fastify's `request.id` and the incoming `x-request-id`, and doesn't echo a header. `FastifyRequest.requestId` is typed but never set |
| Service container / DI | ❌ | `services.plugin.ts` returns `{}` in root (auth breaks). Overlays hard-wire `AuthService` per request. Not a container; `Services` type is undefined |
| DB adapters | ⚠️ | `db` adapter decorated, but root code uses `app.prisma` (not decorated in root). PG overlay decorates both. Adapter interface defined 3 times |
| Validation | ✅/⚠️ | Zod preHandlers work and errors map to 400. Not wired into Fastify schemas, so no OpenAPI and no response serialization |
| Error handling | ⚠️ | Good envelope. Plugin domain errors (`GeoError`, `PaymentError`, `CloudinaryError`) have no `statusCode`, so they become 500s and leak messages in non-prod |
| AuthN/AuthZ | ❌ | JWT forgery (F-01). No permission/role guard exists despite "RBAC" in the README. Roles and permissions only travel in the token |
| API prefix/versioning | ✅ | `${API_PREFIX}/${API_VERSION}/${kebab(dir)}`. System modules hardcoded to `""` |
| Health/readiness | ⚠️ | Overlays OK. Root `/ready` always fails (`prisma` undefined, redis unconditional). Readiness is per-DB code instead of `db.ping()` |
| Metrics | ⚠️ | Unbounded `route` label for unmatched URLs. `/metrics` unauthenticated. `METRICS_ENABLED` env is never read |
| Module discovery | ⚠️ | Requires export named `${dir}Module`, which is impossible for kebab-case dirs. Synchronous `require` is fine |
| Types / public API | ❌ | Augmentation never checked (see F-09). Decorators typed as always-present (`redis`, `cache`, `queue`, `event`, `prisma`, `logger`) when they are optional |
| Shutdown / cleanup | ⚠️ | DB/Redis close in `onClose`. BullMQ queues never closed. No signal wiring |

---

## 4. Plugin architecture

**What exists:** a hand-written registry (`src/plugins/index.ts`) that registers 1 DB plugin, 5 core plugins, then optional plugins keyed on a comma-separated `PLUGINS` env.

**Problems**
- Static imports of every optional plugin, so every optional dependency is mandatory at runtime (F-02).
- Dependency rules live in `if` blocks: they warn and continue, are incomplete (events→queue), and are duplicated in 3 registry copies.
- Unknown plugin names are silently ignored. The CLI writes `PLUGINS=socket`, which nothing handles.
- `fastify-plugin` metadata is used inconsistently: `name` only on geo/cloudinary/payment/db-mongoose; `dependencies` never used. So Fastify can't enforce order or catch duplicate registration for the rest.
- Decoration typing is global and unconditional (`redis: Redis`), so the types lie when a plugin is disabled.

**What's already good, and should become the convention.** The Geo, Cloudinary and Payment plugins share a strong pattern:
`fp(fn, { name })` · `options.config ?? loadXConfig()` (testable injection) · typed error hierarchy with `code` · provider adapter interface · optional decorator (`geo?: GeoService`) · structured registration log without secrets.

**Recommended standard: a minimal, practical plugin contract**
```ts
// framework: one manifest entry per plugin — used by the registry AND the CLI
export const geo = definePlugin({
  name: "geo",
  requires: ["cache?"],                    // "?" = optional
  packages: { axios: "^1.19.0", geolib: "^3.3.14" },
  env: geoEnvSchema,                       // zod, validated only when enabled
  load: () => import("./geo/plugin"),      // lazy → no import unless enabled
});
```
Benefit: it fixes F-02, F-13 and F-29 (CLI dependency drift) at once, and the CLI reads `packages` instead of a hardcoded list. Cost: medium. Existing plugin bodies don't change, only how they are found and registered.

---

## 5. Database support & Mongo model registration

- **Integration asymmetry.** Both DBs decorate `app.db` (good), but the app code around them diverges: Prisma repositories receive a client, Mongo repositories import global models, readiness differs, `services.plugin` differs, and `base.repository.ts` is Prisma-only (`findUnique`, `id: number`). That's why 26 overlay files exist.
- **Mongo code leaks into PG apps:** `app.ts:6` → `core/model-loader.ts` → `core/register-model.ts` → `import mongoose`. That is a hard crash in PG apps (verified). `app.ts:19` is also a TS error in PG apps.
- **`registerModel()`** (`core/register-model.ts`):
  - Duplicate-name handling returns the existing model **even if the schema is different**, so two modules defining `User` silently share the first schema.
  - Default connection only. No multi-connection support (fine if documented).
  - The generic signature `registerModel<T = any>(…, schema: Schema<any>): Model<T>` → `mongoose.model<T>(…)` causes the TypeScript OOM under TS 6.0.2 / mongoose 8.24.2 (isolated, F-09).
- **`registerModels()` loader:** runs **after** `registerModules` (`app.ts:16-21`), so it doesn't guarantee models exist before routes or services are built. It works today only because repositories import models directly. It scans `modules/*/*.model.ts` and `models/**` one level deep, and uses `console.log` when no logger is given. It should live inside the `db-mongoose` plugin (connect → load models → decorate), which also removes the mongoose import from PG apps.
- **Mongoose adapter:** solid connect/reuse/listener logic and URI redaction. It reads `process.env.MONGO_URI` directly instead of `config.db.url`, so the overlay's validated config is bypassed.
- **Prisma plugin (root):** has a SQLite branch importing `@prisma/adapter-better-sqlite3`, but the registry never routes `sqlite` to it, and generated apps don't install that adapter. The PG overlay removes the branch: one more fork.
- **Hot reload:** `ts-node-dev --respawn` restarts the process, so the registerModel cache matters mainly for Jest. Acceptable.

No reason found to replace Prisma or Mongoose.

---

## 6. Framework-level integrations (Geo / Cloudinary / Payment)

| Aspect | Geo | Cloudinary | Payment |
|---|---|---|---|
| fp name | ✅ `geo` | ✅ `cloudinary` | ✅ `payment` |
| Config | `process.env` loader (duplicates zod) | same | same, **plus different defaults** (dummy keys in both zod and `config.ts`) |
| Missing credentials | fails fast (Google asserts 5 vars; 4 are commented out in `.env.example`) | fails fast ✅ | **falls back to mock, even in production** ❌ (F-04) |
| Errors | typed, no `statusCode` | typed, no `statusCode` | typed, no `statusCode` |
| Secrets in errors | `cause` = AxiosError whose config holds `params.key` (Google key); may reach logs via pino `err` serialization (potential) | — | — |
| Fallback provider | TomTom is a stub that rejects every call, so `GEO_FALLBACK_PROVIDER=tomtom` gives a guaranteed-failing fallback | n/a | mock always registered |
| Cleanup | none needed | none needed | none needed |
| Tests | none | none | none |
| Registered in PG apps | **no** (stale overlay) | **no** | **no** |
| Dependencies declared by CLI | **no** | **no** | **no** |

These are the right convention to standardize on (§4). Fix the three cross-cutting gaps: a common `FrameworkError` with `statusCode`/`expose`, config through one schema, and fail-closed in production.

---

## 7. Security & production readiness

**Confirmed vulnerabilities**
- **F-01** Admin JWT forgery via the hardcoded `"secret_admin"` and key selection from an unverified claim (`src/plugins/jwt.plugin.ts:9-18, 36-45`). Reproduced.
- **F-05** Publicly known default `JWT_SECRET=SUPERSECURESECRET` (`.env.example:27`), copied to `.env` by `compose.js:174`, accepted by `env.schema.ts` `min(10)`.
- **F-04** Payment fail-open: production + missing keys → mock gateway. Mock `verifySignature` accepts the literal `"mock-valid"` or `sha256("mock|"+payload)`, which anyone can compute (`mock.provider.ts:195-201, 294-296`).
- **F-17a** Bearer tokens written to logs: `auth.guard.ts:27` logs `{ authHeader }` whenever the scheme isn't exactly `Bearer` (e.g. `bearer <jwt>`).

**Potential risks / missing safeguards**
- No `@fastify/cors`, `@fastify/helmet` or rate limiting. `/auth/login` and `/auth/register` are open to brute force. The existing `rate-limit` middleware is broken: `request.routerPath` was removed in Fastify 5, it assumes an authenticated user, and it's never wired.
- No pino `redact` (authorization, cookie, password, secrets).
- `/metrics` is public, and its label cardinality is unbounded.
- `realtime.plugin.ts` (not wired): CORS `*`, verifies with `jwt.verify` without `tokenType`, so refresh tokens work as access tokens. It also reads `decoded.userId`, which the JWT plugin never sets.
- Missing `.gitignore` in generated apps → `.env` gets committed (F-06).
- `trustProxy` is unset, so `request.ip` is wrong behind a load balancer. That matters once rate limiting exists.
- Error envelope leaks raw messages for non-AppErrors when `NODE_ENV !== "production"`. Acceptable only if staging sets production.
- `engines: node >=16` in root, but Fastify 5 requires Node ≥ 20.

---

## 8. Template generation & publishing pipeline

| Question | Answer |
|---|---|
| Only intended files included? | No. Dead plugins, `_template`, `make-module` templates and repo `.gitignore` content all ship; `.DS_Store` only escapes because npm ignores it |
| Generated `package.json` valid & sanitized? | Valid JSON. **Missing** `build`, `start`, `typecheck`. `test: jest` without jest; `plugin:add` uses `tsx` (not installed) on a file that was removed |
| Runtime deps present? | **No** (F-02) |
| `.env.example` included & safe? | Included; **not safe** (F-05) |
| Internal deps exposed? | Root `package.json` deps don't leak (index.js overwrites them). But the hardcoded list is its own drift source |
| DB config generated correctly? | PG: schema/seed/config copied correctly (verified identical). Mongo: Prisma artifacts removed correctly |
| README matches behavior? | No. It says `cp .env.example .env` (CLI already did it), lists `/api/v1/auth/*` (correct), and claims "RBAC system" (no permission guard). Root README describes a root `template/` dir that is deleted after each build |
| Source ↔ packaged template in sync? | Not reproducible: `template/` is gitignored, published from a local build, with no build step in publish. 0.4.0 is on npm while its version bump is uncommitted locally |
| CLI works as a published package? | **No** (F-03) |
| Generated project independently build/type-check/test/start? | **No / No / No / No** (verified) |

---

## 9. Tests & quality gates

**What exists:** `tests/health.test.ts` (fails before running) and `test-compose.js` (manual; runs inside the repo, so missing dependencies are masked; patches tsconfig `types` to hide the jest error; doesn't boot the app). No CI.

**Contracts with zero protection:** startup/shutdown, plugin dependency rules, env validation, JWT/auth guard, error mapping, module loading, model registration, the CLI as a package, generated-app boot, payment fail-closed.

**Minimal release gates, by risk** (each one would have caught at least one P0 here):

1. `typecheck` passes (after F-09) in the framework repo.
2. **Unit:** JWT (forged token rejected; refresh ≠ access; expiry), payment config (production + missing keys → throws), error-handler mapping, env loader.
3. **Integration (inject, no real DB):** `buildApp()` with a stub DB adapter and `PLUGINS=""` boots; `/health` returns 200; an unknown plugin or missing dependency fails startup.
4. **Packaging smoke test (the critical one):** `npm pack` the CLI → install into a temp dir **outside the repo** → run the generator non-interactively for `{postgresql, mongodb} × {no plugins, all plugins}` → `npm install` → `tsc --noEmit` → `node -e "require('./src/app')"` (module resolution) → optionally boot against service containers.
5. **Drift checks:** the template contains no files from the deny-list; `.gitignore` is present in the generated app; every bare import in shipped `src/` resolves to a declared dependency for each plugin combination (this can be static analysis instead of an install).
6. `prepublishOnly` in the CLI: `build:template && smoke`, and refuse to publish from a dirty tree.

---

## 10. Findings register

Format: **ID · Priority · Title**. Then: Where · Evidence · Why/Impact · Fix · Affected · Compat risk · Tests · Complexity.

### P0 — Critical correctness / security

**F-01 · P0 · JWT admin token forgery**
- **Where:** `src/plugins/jwt.plugin.ts` `getSecret()` L9-18, `verifyToken()` L36-45. Shipped to every app.
- **Evidence:** admin secret literal `"secret_admin"`; fallback `"secret_user"`; key chosen from `jwt.decode()` (unverified) `userType`. A forged admin access token was accepted by identical logic using the installed `jsonwebtoken`.
- **Impact:** anyone can mint admin tokens for any app that uses `userType: "admin"`. User tokens are also forgeable whenever the default secret (F-05) is kept.
- **Fix:** keys come only from config (`JWT_SECRET`, optional `JWT_ADMIN_SECRET`), required with no fallbacks. Pick the key by a server-side audience/`kid` map and verify with `algorithms: ["HS256"]`, `issuer`, `audience`. Never trust `userType` before verification; one option is to try the configured keys rather than decode first.
- **Affected:** `jwt.plugin.ts`, `env.schema.ts` (+ overlays), `fastify.d.ts`.
- **Compat:** existing admin tokens are invalidated (intended).
- **Tests:** forged-admin rejected; refresh rejected by `verifyAccess`; missing secret fails boot.
- **Complexity:** low.

**F-02 · P0 · Generated apps crash at startup (undeclared optional dependencies)**
- **Where:** `src/plugins/index.ts` L12-18 (static imports); `src/app.ts` L6 → `core/model-loader.ts` → `core/register-model.ts` (mongoose); overlay `plugins/index.ts` (both); `packages/create-techunico-app/index.js` L69-126.
- **Evidence:** fresh out-of-repo apps fail with `Cannot find module 'ioredis'`; then `mongoose` (PG) or `axios` (Mongo). `.test-output` resolves those packages from repo root `node_modules`.
- **Impact:** no generated project boots unless the user happens to pick Redis + Queue, and even then not.
- **Fix:** lazy `await import()` inside each enabled branch (the pattern `dbPluginMap` already uses). Move model loading into `db-mongoose`. Drive CLI dependencies from a plugin manifest (§4). Add packaging smoke test (gate 4).
- **Affected:** plugin registry, `app.ts`, CLI.
- **Compat:** none for users (apps can't run today).
- **Tests:** gate 4 matrix.
- **Complexity:** medium.

**F-03 · P0 · Published CLI cannot execute**
- **Where:** `packages/create-techunico-app/package.json` (no `dependencies`); `index.js:6` requires `inquirer`.
- **Evidence:** copy run outside the repo → `Cannot find module 'inquirer'`; `npm view` 0.4.0 shows no dependencies.
- **Impact:** `npx @techunico/node-framework` fails for every external user.
- **Fix:** declare `inquirer` (and pin `engines`). Gate 4.
- **Affected:** CLI `package.json`.
- **Compat:** none.
- **Tests:** packed-CLI smoke.
- **Complexity:** low.

**F-04 · P0 · Payment plugin fails open in production**
- **Where:** `src/plugins/payment/plugin.ts` L46-65; `config.ts` L43-91 (`assertPaymentConfigForStartup` is a no-op); `providers/mock.provider.ts` L195-201, L294-296; `.env.example` ships `PAYMENT_PROVIDER=razorpay` with empty keys.
- **Evidence:** missing/dummy keys → `defaultProvider = Mock` regardless of `NODE_ENV`. The mock accepts `"mock-valid"` or an unkeyed hash. The mock adapter is always registered and selectable via `options.provider`.
- **Impact:** a misconfigured production deploy accepts forged payment or webhook signatures and "succeeds" mock orders.
- **Fix:** in production, throw at startup when the selected provider isn't configured. Register mock only when `NODE_ENV !== "production"` or with explicit `PAYMENT_ALLOW_MOCK=true`. Remove the magic `"mock-valid"` outside tests.
- **Affected:** payment plugin.
- **Compat:** prod deploys without keys now fail fast (intended).
- **Tests:** config matrix (env × provider × keys).
- **Complexity:** low.

**F-05 · P0 · Known default JWT secret in every generated app**
- **Where:** `.env.example:27` → `compose.js:174` copies to `.env`; `env.schema.ts` `JWT_SECRET: z.string().min(10)`.
- **Evidence:** generated `.env` contains `JWT_SECRET=SUPERSECURESECRET` (scratch output).
- **Impact:** user tokens can be forged in any app that keeps the default. Combined with F-06, it often ends up in git too.
- **Fix:** CLI writes `crypto.randomBytes(48).toString("base64url")` into `.env`; `.env.example` leaves it blank; schema `min(32)` and rejects known placeholders.
- **Affected:** CLI, `.env.example`, schema.
- **Compat:** none.
- **Tests:** generated `.env` secret is unique and ≥32 chars; placeholder rejected.
- **Complexity:** low.

### P1 — High-priority architecture / production readiness

**F-06 · P1 · Generated apps have no `.gitignore`**
- **Where:** `build-template.ts:40`; npm strips `.gitignore` from packages (confirmed with `npm pack --dry-run`). The source file also contains the repo-only line `/packages/create-techunico-app/template`.
- **Fix:** ship it as `template/_gitignore`, rename it in `index.js`, and use an app-specific ignore list (`.env`, `dist`, `node_modules`, `src/generated`).
- **Complexity:** low.

**F-07 · P1 · Overlays are drifting forks; PG apps silently lose Geo/Cloudinary/Payment**
- **Where:** `overlays/postgresql/src/plugins/index.ts` (dated 06-28) vs `src/plugins/index.ts` (07-31); 9 PG + 17 Mongo full-file overrides; no drift check.
- **Evidence:** the diff shows the PG registry lacks the 3 plugin imports and branches, while the PG env schema and `.env.example` still advertise them.
- **Impact:** setting `PLUGINS=geo` in a PG app does nothing and logs nothing. Every core change must be replicated by hand up to 3 times.
- **Fix:** make `src/` DB-agnostic where the differences are incidental: a `db.ping()` on the adapter for readiness, services wiring through the DB adapter, one registry, and one env schema with a `discriminatedUnion` on `DB_PROVIDER`. Keep overlays only for genuinely DB-specific files (repositories, models, seed, schema). Add a CI check listing allowed overlay paths.
- **Affected:** registry, config, health, services, controllers.
- **Compat:** low for new apps.
- **Complexity:** medium-high.

**F-08 · P1 · The framework repo's own `src/` is not runnable**
- **Where:** `request.server.prisma` used in `modules/user/user.controller.ts:6`, `modules/metrics/metrics.controller.ts:6`, `modules/health/health.routes.ts:20`, `_template`, but never decorated in root `prisma.plugin.ts:73-74`; `services.plugin.ts:9` returns `{}`; root `auth.controller.ts:14` signs without `tokenType` (throws, verified); `/ready` pings Redis unconditionally; local `.env` `DB_PROVIDER=sqlite` is unsupported.
- **Impact:** developers can't exercise the code they ship. The overlays, not `src/`, are the real implementation. This is why F-02 and F-07 went unnoticed.
- **Fix:** follows from F-07. Root dev should run the PG composition, e.g. a `dev:pg` script that composes into `.dev-app/` or runs with overlays applied.
- **Complexity:** medium.

**F-09 · P1 · No working type-check; type contracts are unchecked**
- **Where:** `core/register-model.ts` (OOM in isolation); `tsconfig.json` `types: ["node","jest"]` (TS2688 in apps); `skipLibCheck: true` + augmentation in `src/types/fastify.d.ts`, so undefined `Services`, `UserType`, `TokenType` silently become `any`; `test-compose.js:166` rewrites tsconfig to hide the error.
- **Fix:** change the `registerModel` signature (candidate: `registerModel<TSchema extends Schema>(name, schema: TSchema)` returning `Model<InferSchemaType<TSchema>>`, or a non-generic call cast once; **must be verified against the OOM**). Rename the augmentation to `fastify-augment.ts` so it is type-checked. Keep jest types in `tsconfig.test.json` only. Mark optional decorators optional.
- **Compat:** app code using `any`-typed services may surface type errors (desired).
- **Complexity:** medium.

**F-10 · P1 · Test suite and CLI test give false confidence; no CI**
- **Where:** `tests/health.test.ts` fails at `config/env.ts` (test defaults omit `DB_PROVIDER`, `REDIS_*`; default `PLUGINS='redis,events'` would register events without queue); `test-compose.js` runs inside the repo; no `.github/`.
- **Fix:** gates 1-6 (§9).
- **Complexity:** medium.

**F-11 · P1 · Metrics: unbounded label cardinality, unauthenticated endpoint**
- **Where:** `plugins/metrics.plugin.ts:16` `routeOptions?.url ?? request.url` (raw URL including query string for unmatched routes); `modules/metrics/metrics.routes.ts`; `METRICS_ENABLED` never read.
- **Impact:** a URL scanner creates unbounded time series, growing memory without limit, and anyone can read `/metrics`.
- **Fix:** use the label `"__unmatched__"` when no route matched; make the endpoint optional and protected (token or separate port); honor `METRICS_ENABLED`.
- **Complexity:** low.

**F-12 · P1 · No graceful shutdown**
- **Where:** `src/server.ts` (no signal handlers; `buildApp()` outside try); `queue.service.ts` never closes queues.
- **Fix:** handle SIGTERM/SIGINT → `app.close()` with a timeout; close BullMQ queues in `onClose`; log and exit 1 on startup failure.
- **Complexity:** low.

**F-13 · P1 · Plugin dependency rules incomplete and fail-soft; unknown plugins ignored**
- **Where:** `plugins/index.ts:58-98` (`events` needs `app.queue` but only checks redis, so `new EventService(undefined)`); warnings instead of errors; CLI `socket` option (`index.js:48,124`) maps to nothing; realtime/presence/rate-limit never registered.
- **Fix:** manifest-based registry (§4) with `requires`; fail startup on unknown names or missing requirements; `fp({ name, dependencies })` on every plugin.
- **Complexity:** medium.

**F-14 · P1 · Configuration has multiple sources of truth**
- **Where:** `config/app.ts` (raw PORT + dotenv side effect), `config/index.ts`, `bootstrap/config.ts` (workers, no dotenv), `geo/config.ts`, `cloudinary/config.ts`, `payment/config.ts`, `mongoose.adapter.ts:100`; root schema requires `DATABASE_URL`/`REDIS_*` regardless of DB or plugins.
- **Impact:** defaults disagree (payment), tests can't import `app.ts`, workers crash without exported env.
- **Fix:** one `loadConfig()` (dotenv at entry, base schema plus per-plugin schemas validated only when enabled); plugins receive config through options.
- **Complexity:** medium.

**F-15 · P1 · No production build/start path in generated apps; broken scripts**
- **Where:** `build-template.ts:50-65` copies `build`/`start` only if root defines them (it doesn't); template `test` needs jest, `plugin:add` needs tsx plus a deleted file; root `engines >=16`.
- **Fix:** template-owned `package.json` (not derived from root) with `build: tsc` (plus `tsc-alias` or runtime `tsconfig-paths` for `@/`), `start: node dist/server.js`, `typecheck`, `test`; `engines: >=20`. Note the module loader already handles `.js` in `dist`.
- **Complexity:** low-medium.

**F-16 · P1 · Release process not reproducible**
- **Where:** `template/` gitignored and built locally; no `prepublishOnly`; 0.4.0 published while the bump is uncommitted; no tags.
- **Fix:** `prepublishOnly: build:template && smoke`; publish from CI on tag; record the template hash or commit in the package.
- **Complexity:** low.

**F-17 · P1 · Secrets and credentials in logs/errors**
- **Where:** `core/auth.guard.ts:27` logs the full header (confirmed). Pino has no `redact`. Plugin errors keep `cause` (AxiosError including the Google `key` query param). Whether pino serializes the nested `cause` config depends on the serializer: **potential, unverified**.
- **Fix:** never log the header; `redact: ["req.headers.authorization","req.headers.cookie","*.password","*.apiKey","*.secret"]`; strip `config` from provider error causes.
- **Complexity:** low.

**F-18 · P1 · Missing HTTP safeguards**
- **Where:** no CORS, helmet or rate-limit registration anywhere; broken `middleware/rate-limit.ts` (`routerPath`); auth endpoints unthrottled; `trustProxy` unset.
- **Fix:** register `@fastify/helmet`, `@fastify/cors` (config-driven allowlist), `@fastify/rate-limit` (Redis store when available) as core plugins with sane defaults; delete the custom middleware.
- **Complexity:** low-medium.

### P2 — Maintainability / consistency / DX

- **F-19 · Mongo `registerModel` silently returns a model with a different schema on name collision.** `core/register-model.ts:26-29`. Fix: throw if `existing.schema !== schema` (allow the same schema object for hot reload), and run the loader inside `db-mongoose` before modules. Low.
- **F-20 · Request context not production-grade.** `plugins/context.plugin.ts` ignores `request.id`/`x-request-id`, doesn't echo a header; `requestId`/`user` typed but unused. Fix: `genReqId` honoring the incoming header plus a response header; optionally AsyncLocalStorage. Low.
- **F-21 · Plugin domain errors map to 500.** `core/error-handler.ts` has no branch for `GeoError`/`PaymentError`/`CloudinaryError`. Fix: a common `FrameworkError { statusCode, code, expose }` base; map in the handler. Low.
- **F-22 · Module loader & generator naming.** `module-loader.ts:22` requires `${dir}Module`; `make-module.ts` produces `order-itemsModule`/`order-itemsController` (invalid identifiers) and detects the DB by `.env` substring. Fix: accept `default` export or a camelCased name; validate names; read `DB_PROVIDER` properly. Low.
- **F-23 · Generator templates are DB-confused.** `templates/module/service.ts.txt` duck-types Prisma vs Mongoose (`client.model(...)` throws if unregistered); the PG repository template imports a Prisma type that doesn't exist yet. Fix: per-DB template sets. Low.
- **F-24 · Dead/experimental code shipped to every app.** realtime, presence, rate-limit (plugin + middleware), multitenancy, streaming, `logger.plugin.ts`, `core/register-modules.ts`, `events/event.loader.ts` (hardcoded `dist/`), `queues/workers/*` (no scripts), `db-prisma/prisma.adapter.ts`, fake `plugins/*/package.json`, `utils/validate.ts` (duplicate). Fix: delete, or move to `experimental/` excluded from the template. Low.
- **F-25 · Decorator typing doesn't match runtime.** `redis`, `cache`, `queue`, `event`, `prisma`, `logger` declared non-optional; `jwt.sign` types reference undeclared types; augmentation duplicated in the Mongo overlay. Fix with F-09. Low.
- **F-26 · Redis resilience.** `redis.plugin.ts`: no ready wait, infinite retries plus offline queue (requests hang when Redis is down); `cache.service.ts:54` uses blocking `KEYS`. Fix: `enableOfflineQueue` policy, `await redis.ping()` at startup, `SCAN` for flush. Low.
- **F-27 · Geo config defaults.** Google provider requires 4 base URLs that `.env.example` comments out and nothing defaults; the TomTom stub can be configured as a (always-failing) fallback. Fix: default the official Google URLs; reject `tomtom` until implemented. Low.
- **F-28 · CLI robustness.** No project-name validation (`../x`, absolute paths); no non-interactive flags (blocks CI smoke tests); a failed install leaves a half project; plugin choices omit cache, events, geo, cloudinary, payment; dependency list duplicated in `test-compose.js`; `mongoose ^8.5.0` vs framework-tested `^8.24.2`. Medium.
- **F-29 · `BaseRepository` is Prisma-only** (`findUnique`, `id: number`) but sits in `core/`. Fix: move it to `db-prisma` or make it generic per adapter. Low.

### P3 — Optional / future

- **F-30 · Repo hygiene.** Committed `dev.db`, `src/modules/.DS_Store`; 3 Prisma schemas plus a root config supporting sqlite that the runtime rejects; stale root reports; root `package.json` `bin: index.js` (file missing), `main: server.ts`. Low.
- **F-31 · Docs drift.** Root README describes a persistent root `template/` and lists Redis/WebSockets/Events as "future"; the template README promises RBAC (there is no permission guard). Low.
- **F-32 · Fastify-native schemas.** Moving the Zod preHandlers to `fastify-type-provider-zod` gives OpenAPI, response serialization and typed handlers. Medium. Optional.

---

## 11. Strategic decision (needs your call before Phase 2)

**Should the runtime become a real dependency?** Today the framework is copied into each app.

| Option | What it means | Pros | Cons / cost |
|---|---|---|---|
| **A. Keep vendoring, fix the pipeline** | Fix P0/P1 inside the current copy+overlay model, add manifest and gates | Smallest change, no new package | Fixes like F-01 still can't reach existing apps; overlay drift risk stays (reduced by checks) |
| **B. Extract `@techunico/core` (runtime) + slim template** | `core/`, plugin registry, built-in plugins, config loader, error handling become a versioned dependency. The template keeps only `server.ts`, `app.ts` (calling `createApp({ modules, plugins })`), `config/`, `modules/`, models/schema | Security fixes ship by `npm update`; overlays shrink to DB-specific app files; plugins can declare their own peer deps | High: build/emit pipeline for the package, public API design, migration of any existing apps |

The repo itself justifies B: F-01, F-07 and F-08 all exist because there is no single shipped runtime. Even so, **I recommend doing Phase 1 under A first**, so working software exists, and then deciding on B with that baseline.

## 12. Proposed plan (pending approval)

**Phase 1 — make it safe and working (P0 + the gates that prove it)**
1. F-01 JWT keys · F-05 random secret · F-04 payment fail-closed · F-17 header logging (all low).
2. F-03 CLI deps · F-06 `_gitignore` (low).
3. F-02 lazy plugin loading + move the Mongo loader into `db-mongoose` (medium).
4. Gate 4 packaging smoke test (outside the repo, PG/Mongo × none/all plugins) and `prepublishOnly` (F-16).

**Phase 2 — single source of truth**
5. Plugin manifest driving both registry and CLI (F-13, F-28 dependency drift).
6. One config loader and schema (F-14); DB-agnostic health/services → shrink overlays (F-07, F-08).
7. Fix type-check (F-09/F-25) and add unit/integration tests (F-10).

**Phase 3 — production hardening**
8. Shutdown (F-12), metrics (F-11), helmet/cors/rate-limit/redact (F-18), template build/start (F-15), error mapping (F-21), Redis resilience (F-26).

**Phase 4 — cleanup & DX:** F-19, F-20, F-22-F-24, F-27, F-29-F-32; decide Option A vs B.

### Open questions for you
1. Are there **existing generated apps in production**? If so, F-01/F-05 need a patch advisory for them (vendored code won't update itself).
2. Is `userType: "admin"` with a separate key a real requirement (separate admin audience), or can one key plus a role claim suffice?
3. Should SQLite remain a supported dev provider, or be removed (it is half-implemented today)?
4. Are realtime/presence/multitenancy roadmap items to keep under `experimental/`, or can they be deleted?
