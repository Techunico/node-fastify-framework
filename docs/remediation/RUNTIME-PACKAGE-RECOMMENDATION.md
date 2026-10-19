# Recommendation: copied framework vs. a versioned runtime package

Status: recommendation only. No runtime package was extracted during stabilization.

## Current model (after stabilization)

The CLI copies `src/` into each application. Stabilization reduced the cost of that model:

- one manifest (`src/framework.manifest.json`) for packages, databases and plugins;
- one source tree with a 4-file MongoDB overlay (enforced by a drift test);
- configuration injected (`loadConfig()` → `buildApp({ config })`), no import side effects;
- a packaging smoke test that exercises the published shape outside the repository.

It does **not** change the fundamental property: an application owns a fork of the framework.

## Evidence from this remediation

| Observation | What it shows |
|---|---|
| F-01 (JWT forgery) and F-05 (default secret) are fixed here but **every existing app stays vulnerable** until patched by hand (see SECURITY-ADVISORY.md) | Security fixes cannot be delivered |
| Phase 1–3 touched ~60 framework files that apps also contain | Upgrading an existing app means a manual three-way merge with app changes |
| Fresh installs resolved Fastify 5.12 / light-my-request 6.8 / cookie 2 while the repo lock had 5.8 / cookie 1 — two breakages found only by the smoke test | Each app drifts independently; the framework cannot declare and test a supported range |
| The framework/application boundary had to be drawn file by file (`database.ts`, `services.plugin.ts`, repository contracts) | A public API now exists implicitly; it is not versioned |

## Options

### A. Keep copying (status quo)

- **Pros:** no migration; apps can change anything; no package build pipeline.
- **Cons:** no security-fix delivery; per-app dependency drift; framework changes are invisible to
  existing apps; every app must be audited separately.
- **Cost:** none now; recurring cost per incident × number of apps.

### B. `@techunico/core` runtime package + thin template (recommended direction)

The package would contain what apps should not edit:

`core/` (JWT, auth guard, error handler, readiness, lifecycle, module loader, metrics),
`config/` loader and base schema, the plugin registry + manifest, and the plugins
(`db-prisma`, `db-mongoose`, redis, cache, queue, events, geo, cloudinary, payment).

The template keeps what apps own:

`server.ts`, `app.ts` (`createApp({ config, modules, database })`), `modules/`, `models/`,
`prisma/`, the services container, `.env.example`, tests.

Dependency management: database drivers and plugin SDKs become **optional peer dependencies** of
`@techunico/core`, loaded lazily exactly as today (`findMissingPackages` already produces the
install hint).

- **Pros:** `npm update @techunico/core` delivers fixes; the package can be tested against a
  declared Fastify/Prisma/Mongoose range in CI; the public API becomes explicit and semver-governed.
- **Cons:** needs a build/publish pipeline (`tsc` to `dist`, `.d.ts`), path aliases replaced by
  package imports, a documented API, and migration of existing apps.
- **Cost:** medium for new apps (most of the boundary already exists after this remediation);
  per existing app: replace copied `core/`, `plugins/`, `config/` with imports, keep `modules/`.

### C. Hybrid: keep copying, add an upgrade tool

`create-techunico-app upgrade` applying framework diffs to an app. Lower up-front cost than B but
merge conflicts in edited framework files make it unreliable for security fixes.

## Recommendation

1. **Now:** release the stabilized CLI (copy model), and patch existing apps using the advisory.
2. **Next:** extract `@techunico/core` (option B) behind a `0.x` version, starting with the
   security-critical parts (`core/jwt.ts`, `core/auth.guard.ts`, error handler, plugin registry,
   payment plugin). Generate new apps against it; migrate existing apps opportunistically,
   prioritising production apps.
3. Define the public API before extracting: `buildApp/createApp` options, `app.config`, `app.db`
   contract (`DatabaseAdapter`), `authGuard` / `authorize`, `ReadinessRegistry`, plugin manifest
   format, error classes. Everything else stays internal.

Prerequisites already in place: the manifest, injected configuration, the database adapter
contract, the repository contract pattern, and the packaging smoke test (which would test the
package and the template together).
