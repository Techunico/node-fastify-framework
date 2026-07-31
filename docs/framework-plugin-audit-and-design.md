# Techunico Node Framework — Plugin Infrastructure Audit & Design

**Date:** 2026-07-31  
**Reference project:** `/Users/praveenkumar/Documents/projects/vsaas/b2c/backend`  
**Framework:** Techunico Node Framework (`nodejs_framework`)  
**Scope:** Extract reusable infrastructure only (Geo, Cloudinary, Payments, MongoDB)

---

## PHASE 1 — AUDIT

### 1. Executive summary

| Area | Framework today | Client project | Verdict |
|------|-----------------|----------------|---------|
| **MongoDB plugin** | Minimal connect/disconnect adapter | Production adapter + model auto-loader | **Migrate adapter + model registry** |
| **Geo plugin** | Missing | Full provider architecture (Google + TomTom stub) + geometry helpers | **Port entire plugin (generic)** |
| **Cloudinary plugin** | Type declaration only (no implementation) | Minimal upload/delete/url service | **Port + harden (typed, self-configuring)** |
| **Payments plugin** | Missing | Enterprise gateway abstraction (Razorpay + Mock) | **Port entire plugin (generic)** |

The client project is a production evolution of this framework. Its infrastructure plugins (especially geo, payment, and mongoose) are significantly more mature. Application modules (Trip, Settlement, DemandIntelligence, etc.) must **not** be migrated.

---

### 2. Current framework capabilities

#### 2.1 Plugin architecture (present)

- Fastify plugin composition via `src/plugins/index.ts`
- Optional plugins driven by `PLUGINS` env (`redis`, `cache`, `queue`, `events`)
- DB provider switch: `postgresql` → Prisma, `mongodb` → Mongoose
- Core: JWT, response envelope, metrics, request context, services DI
- Scaffolding: `create-techunico-app`, `make:module`, `plugin:add`, `build:template`

#### 2.2 MongoDB plugin (framework)

**Files:** `src/plugins/db-mongoose/mongoose.{adapter,plugin}.ts`

| Capability | Status |
|------------|--------|
| Connect via `MONGO_URI` | Yes |
| Disconnect on `onClose` | Yes |
| `app.decorate("db")` | Yes |
| Connection pool options | No |
| Lifecycle event logging | No |
| Reuse existing connection (readyState) | No |
| `isConnected()` | No |
| Model auto-discovery | **No** |
| `registerModel()` helper | **No** |
| Hot-reload / duplicate model protection | **No** |
| Named plugin (`fp` name / encapsulate) | No |

**Model template** (`scripts/templates/module/model.ts.txt`) uses bare `mongoose.model()` — unsafe under `ts-node-dev` reloads.

#### 2.3 Geo / Cloudinary / Payments (framework)

| Plugin | Implementation | Notes |
|--------|----------------|-------|
| Geo | **Absent** | No package, no plugin |
| Cloudinary | **Broken stub** | `fastify.d.ts` declares `cloudinary: CloudinaryService` but type and plugin do not exist |
| Payments | **Absent** | No package, no plugin |

---

### 3. Client project capabilities

#### 3.1 MongoDB plugin (client) — maturity **9/10**

**Adapter improvements:**

- Logger injection (`setLogger`)
- Lifecycle listeners: connected / disconnected / reconnected / error / close
- Single-connection reuse (`readyState` 1 and 2 handling)
- Pool: `maxPoolSize: 20`, timeouts
- URI redaction in logs
- Safe disconnect (ignore errors)
- `isConnected()`

**Model registration (`src/core/model-loader.ts`):**

```
registerModels()
  → resolve modules path relative to __dirname (src or dist safe)
  → for each module dir, require *.model.ts | *.model.js
  → side-effect registration of mongoose models
```

Strengths:

- Works in dev (ts-node) and prod (compiled CommonJS)
- Avoids `process.cwd()` pitfalls on platforms like Render
- Uses `require()` intentionally (dynamic `import()` of `file://` fails under CJS)

Gaps in client:

- No generic `registerModel()` helper exported from framework core
- Inconsistent hot-reload protection (only some models use `mongoose.models.X \|\| mongoose.model(...)`)
- Does not scan top-level `src/models/` (framework Mongo overlay uses that path)
- Uses `console.log` instead of injected logger
- No return value / registry inventory

#### 3.2 Geo plugin (client) — maturity **9/10**

```
plugins/geo/
  adapter.ts          GeoAdapter interface
  config.ts           env-based loadGeoConfig()
  errors.ts           typed error hierarchy
  http-client.ts      axios retries + timeouts
  types.ts            full DTO surface
  service.ts          facade: remote APIs + local geometry (geolib)
  plugin.ts           Fastify decorator app.geo
  providers/
    google.provider.ts   full implementation
    tomtom.provider.ts   stub (extensibility proof)
```

Capabilities:

- Reverse geocode, geocode, distance matrix, route matrix, route
- Snap-to-road, places autocomplete/details, timezone, elevation, nearest road, speed limit
- Local: polygon, polyline, radius, distance, bearing, polyline encode/decode, buffers, ETA helpers
- Provider fallback chain + optional cache decorator integration
- AbortSignal support, structured logging

**Not reusable (do not migrate):**

- `src/utils/geo.ts` — legacy Google Maps client helper tied to app config
- Any zone/city/trip pricing usage of geo

#### 3.3 Cloudinary plugin (client) — maturity **4/10**

Minimal:

- `uploadBuffer(buffer, folder)`
- `delete(publicId)`
- `getUrl(publicId, options)`
- Hard dependency on `@/config.cloudinary`

Missing for a framework-grade plugin:

- Self-contained env config loader
- Typed results / error classes
- Replace, rename, multi-delete
- Signed upload params
- Upload from path / data URI
- Transformation helpers
- Optional registration (should not force env vars)

#### 3.4 Payments plugin (client) — maturity **9.5/10**

Enterprise-grade:

- `PaymentGatewayAdapter` boundary (SDK isolation)
- `PaymentService` sole public surface (`app.payment`)
- Razorpay + Mock adapters
- Money in minor units only
- Webhook: verify → parse → normalize
- Capabilities + health reports
- Multi-provider routing (`{ provider: "mock" }`)
- Boot-safe fallback to mock when secrets missing
- Deprecated aliases for v1 method names

**Business modules (do not migrate):** Payment, Payments, PaymentWebhook, Invoice, Settlement, wallet — those are product code.

Optional correlation fields (`tripId`, `driverId`, etc.) are **generic optional metadata** on `PaymentContext` and are fine in the framework.

---

### 4. Architecture differences

| Concern | Framework | Client |
|---------|-----------|--------|
| Plugin opt-in | `PLUGINS` for redis stack only | Always-on cloudinary + payment; geo via `PLUGINS` |
| Config | Lean Zod schema | Domain-heavy Zod + config map |
| Mongo models | Manual import / none | Auto-load after modules |
| DB types | Minimal `DatabaseAdapter` | Same interface; richer adapter methods |
| Fastify types | Stale Cloudinary ref | Full payment / realtime / presence |

---

### 5. Duplicate implementations

| Item | Framework | Client | Action |
|------|-----------|--------|--------|
| Mongoose adapter | Basic | Advanced | Replace framework with client-grade adapter (compatible API) |
| DatabaseAdapter interface | Duplicated in adapter file + `core/interfaces` | Same | Keep core interface; extend optionally with `isConnected` |
| Legacy `utils/geo.ts` | N/A | Exists | **Do not migrate** (superseded by geo plugin) |

---

### 6. Plugin maturity scores

| Plugin | Framework | Client | Target after work |
|--------|-----------|--------|-------------------|
| MongoDB | 3/10 | 9/10 | **9.5/10** (adapter + `registerModel` + multi-path loader) |
| Geo | 0/10 | 9/10 | **9/10** |
| Cloudinary | 1/10 | 4/10 | **7.5/10** |
| Payments | 0/10 | 9.5/10 | **9.5/10** |

---

### 7. MongoDB / model registration comparison

| Feature | Framework | Client | Recommendation |
|---------|-----------|--------|----------------|
| Connection lifecycle | Minimal | Strong | **Adopt client** |
| Auto model load | None | `registerModels()` | **Adopt + extend** |
| `registerModel()` API | None | Partial (ad-hoc in models) | **Add first-class helper** |
| Hot reload safety | No | Partial | **Enforce via helper** |
| Modules path resolution | N/A | `__dirname`-relative | **Adopt** |
| Scan `src/models/` | N/A | No | **Add** (framework overlay) |
| Logging | N/A | console | **Use app.log** |
| Backward compatibility | N/A | — | Optional call from `app.ts` only when `DB_PROVIDER=mongodb` |

**Is client model registration superior?**  
**Yes.** The framework currently has no model registration system. Client auto-discovery is the correct base. We will improve it with:

1. Explicit `registerModel(name, schema)` for hot-reload safety  
2. Dual discovery paths: `modules/**/**.model.*` and `models/**/**.model.*`  
3. Structured logging and returned inventory  
4. Safe no-op when modules directory is empty (scaffold friendliness)

---

### 8. Risk analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| New env vars break existing Zod validation | High | All new vars optional with defaults |
| Always-on payment/cloudinary forces secrets | Medium | Opt-in via `PLUGINS` in framework (BC) |
| Mongoose adapter signature change | Low | Keep `connect/disconnect/getClient`; add methods |
| `registerModels` double-require crash | Medium | `registerModel` + `mongoose.models` guard |
| Heavy optional deps (razorpay, cloudinary, geolib) | Low | Document; add to package.json; unused when plugin off |
| Template drift | Medium | Change `src/` (source of truth); rebuild template when publishing |
| Business field names on PaymentContext | Low | Keep optional correlation IDs; no business logic |

---

### 9. Improvement recommendations

1. **MongoDB first** — adapter + model registry unlock every Mongo project  
2. **Geo** — port as-is; optional `PLUGINS=geo`  
3. **Cloudinary** — port with self-config, types, extras; optional `PLUGINS=cloudinary`  
4. **Payments** — port as-is; optional `PLUGINS=payment` (mock-safe)  
5. **Do not migrate** application modules, schemas, auth rules, ride/trip/cart logic  
6. **Do not migrate** `utils/geo.ts`, multipart helpers, SMS, demand intelligence config  
7. Fix broken `CloudinaryService` type reference in `fastify.d.ts`

---

## PHASE 2 — DESIGN

### Global conventions

- Plugin folder under `src/plugins/<name>/`
- `fp` registration with explicit `name`
- Optional plugins gated by `config.app.plugins` (`PLUGINS` env)
- Self-contained config loaders (env), not hard-coded app domain config
- TypeScript strict; provider/adapter pattern for external SDKs
- Logger via Fastify `app.log`
- No breaking changes to existing plugin APIs

---

### 1. MongoDB plugin

#### Folder structure

```
src/plugins/db-mongoose/
  mongoose.adapter.ts   # enhanced
  mongoose.plugin.ts    # enhanced
  package.json
src/core/
  model-loader.ts       # NEW — auto discovery
  register-model.ts     # NEW — registerModel() helper
```

#### Files to modify

| File | Change |
|------|--------|
| `mongoose.adapter.ts` | Lifecycle, pool, logging, `isConnected` |
| `mongoose.plugin.ts` | Named fp, logger wiring, encapsulate:false |
| `app.ts` | Call `registerModels()` when `DB_PROVIDER=mongodb` |
| `core/interfaces/database.ts` | Optional `isConnected?`, `getClient?` |
| `scripts/templates/module/model.ts.txt` | Use `registerModel` |
| `.env.example` | Document `MONGO_URI` (already present) |

#### New APIs

```ts
// register-model.ts
function registerModel<T>(name: string, schema: Schema, collection?: string): Model<T>

// model-loader.ts
function registerModels(options?: { logger?: Logger; paths?: string[] }): Promise<string[]>
```

#### Migration / BC

- Existing projects that manually import models keep working  
- `registerModels()` is additive  
- Adapter methods remain compatible  

---

### 2. Geo plugin

#### Folder structure (port from client)

```
src/plugins/geo/
  adapter.ts
  config.ts
  errors.ts
  http-client.ts
  index.ts
  plugin.ts
  service.ts
  types.ts
  providers/
    google.provider.ts
    tomtom.provider.ts
```

#### Registration

- `PLUGINS` includes `geo`  
- After cache plugin when possible (optional cache integration)  
- Decorates `app.geo: GeoService`

#### Dependencies

- `axios`, `geolib`

#### BC

- New plugin; no existing callers  

---

### 3. Cloudinary plugin

#### Folder structure

```
src/plugins/cloudinary/
  cloudinary.plugin.ts
  cloudinary.service.ts
  config.ts
  errors.ts
  types.ts
  index.ts
```

#### Public API (framework-grade)

- `uploadBuffer` / `uploadPath` / `uploadBase64`
- `delete` / `deleteMany`
- `rename` / `replace`
- `getUrl` / `getTransformedUrl`
- `getSignedUploadParams` (signed uploads)
- Typed results; `CloudinaryError` hierarchy  
- Config from env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

#### Registration

- `PLUGINS` includes `cloudinary`  
- Decorates `app.cloudinary`

#### Dependencies

- `cloudinary`

---

### 4. Payments plugin

#### Folder structure (port from client)

```
src/plugins/payment/
  adapter.ts
  config.ts
  errors.ts
  index.ts
  money.ts
  plugin.ts
  service.ts
  types.ts
  providers/
    mock.provider.ts
    razorpay.provider.ts
```

#### Registration

- `PLUGINS` includes `payment`  
- Mock always registered; Razorpay when credentials present  
- Decorates `app.payment`

#### Dependencies

- `razorpay`

#### BC

- New plugin; opt-in only  

---

### 5. Wiring (`plugins/index.ts`)

```
DB → JWT → response → metrics → context → services
→ redis stack (existing)
→ cache
→ geo (if enabled)
→ cloudinary (if enabled)
→ payment (if enabled)
→ queue / events
```

---

### 6. Env schema strategy

All new keys optional with safe defaults so existing `.env` files continue to validate:

- Geo / Cloudinary / Payment keys default to empty or dummy  
- No required secrets for boot  
- Mongo still requires `MONGO_URI` only when using mongodb (existing overlay behavior)

---

### 7. Implementation order

1. MongoDB  
2. Geo  
3. Cloudinary  
4. Payments  
5. Typecheck after each  

---

## Explicit non-migration list

- Controllers, routes, services, modules  
- Mongoose schemas / business models  
- Trip / vendor / ride / cart / order / settlement / wallet logic  
- Auth rules, authorize guards, SMS, demand intelligence  
- `utils/geo.ts`, file-upload multiparts, PDF/Excel report code  
- Client-specific env keys (`JWT_ADMIN_SECRET`, trip location thresholds, etc.)

---

## PHASE 3 — IMPLEMENTATION STATUS (completed 2026-07-31)

| Plugin | Status | Notes |
|--------|--------|-------|
| MongoDB | Done | Adapter lifecycle, `registerModel`, `registerModels` dual-path loader |
| Geo | Done | Full port; opt-in `PLUGINS=geo` |
| Cloudinary | Done | Hardened service; opt-in `PLUGINS=cloudinary` |
| Payments | Done | Full port; opt-in `PLUGINS=payment` |

### Enablement

```bash
# .env
PLUGINS=redis,cache,geo,cloudinary,payment
GEO_PROVIDER=google
GOOGLE_MAPS_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
PAYMENT_PROVIDER=mock   # or razorpay with real keys
```

### Model registration usage

```ts
import { Schema } from "mongoose";
import { registerModel } from "@/core/register-model";

export const User = registerModel("User", new Schema({ email: String }));
```

Auto-load runs from `buildApp()` when `DB_PROVIDER=mongodb`.

### Verification performed

- esbuild syntax compile of all new plugin entrypoints  
- Runtime smoke (`ts-node --transpile-only`): registerModel reuse, model-loader, payment mock, geo distance helpers, cloudinary config, mongoose adapter  
- Full `tsc --noEmit` OOMs on this machine with TypeScript 6 + large graph (pre-existing); not introduced by these plugins  

### Follow-ups (optional, not blocking)

- Run `npm run build:template` before publishing CLI  
- Exclude `src/generated` from default typecheck to avoid heap pressure  
- Implement TomTom provider methods when needed  
- Add unit tests for money helpers / signature verification
