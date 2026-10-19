# Changelog

## Unreleased (next release after 0.4.0)

`0.4.0` is already published; release these changes under a new version. Applications generated
by earlier versions are **not** updated automatically — see `docs/remediation/SECURITY-ADVISORY.md`
in the framework repository.

### Security

- JWT: keys come only from `JWT_SECRET` / `JWT_ADMIN_SECRET`; the hardcoded `secret_admin` /
  `secret_user` keys and key selection from unverified claims are gone. Tokens are HS256 with
  `kid`, `iss`, `aud` and `exp` enforced. **Tokens issued by earlier versions are rejected.**
- Each generated app gets unique random JWT secrets; weak and placeholder secrets
  (e.g. `SUPERSECURESECRET`) are rejected at startup.
- Payments fail closed in production: no mock gateway, valid Razorpay credentials required. Mock
  signatures are per-process HMACs (`signForTesting`); the `"mock-valid"` signature is gone.
- The auth guard no longer logs `Authorization` headers; logs redact credentials; provider error
  causes are reduced to `{ name, message, code, status }`.
- Generated apps include a `.gitignore` (previously stripped by npm).
- Helmet, CORS allowlist, rate limiting (stricter on login/register), protected `/metrics`,
  explicit `TRUST_PROXY`, validated `x-request-id`.

### Fixed

- The published CLI declares its dependencies (`inquirer`); `npx` works.
- Generated apps start without optional packages: only selected plugins and their npm packages are
  included. PostgreSQL apps no longer require `mongoose`.
- PostgreSQL apps register Geo / Cloudinary / Payment when enabled (the old overlay dropped them).
- Framework error responses apply to module routes (previously Fastify's default error shape).
- `npm run typecheck` completes (the Mongoose typing that exhausted memory is fixed).
- Readiness checks no longer hang when Redis is down; Redis commands fail after bounded retries.
- MongoDB seed is idempotent; module generator produces valid code for kebab-case names.

### Changed

- New CLI flags: `--db`, `--plugins`, `--pm`, `--skip-install`, `--yes`. Project names are
  validated (no paths). Node.js 20+ required.
- Generated apps: `build`, `start` (compiled), `typecheck`, `test` scripts; `plugin:add` removed.
- `PLUGINS` with unknown names or missing requirements fails startup instead of being ignored.
- Configuration: `loadConfig()` at the entry point, `buildApp({ config })`, `app.config`.
  Optional plugins validate their own variables only when enabled (`REDIS_*` moved to the redis
  plugin; Google base URLs default to the official hosts; `tomtom` is rejected until implemented).
- `registerModel` moved to `@/plugins/db-mongoose/register-model` and throws on conflicting schemas.
- Optional decorators (`app.redis`, `app.cache`, …) are typed optional.
- `reply.success()` / `reply.error()` return the reply.
- SQLite is no longer an accepted `DB_PROVIDER`.

### Removed

- Experimental realtime / presence / rate-limit store / multitenancy / streaming code from
  generated apps (kept in the framework repository under `src/experimental`).
- Unreferenced stubs (metrics controller/service/repository, `auth.repository.ts`,
  `prisma.adapter.ts`, `register-modules.ts`, `event.loader.ts`, `utils/validate.ts`, empty schemas).
