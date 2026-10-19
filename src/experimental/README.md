# Experimental code

Kept for future work; **not supported**.

- Not registered by the framework's plugin registry (`src/plugins/index.ts`).
- Not listed in `src/framework.manifest.json`.
- Excluded from generated applications by `src/scripts/build-template.ts`.

| Directory | What it is | Status / blockers |
|---|---|---|
| `realtime/` | Socket.io server with JWT handshake, user/tenant rooms | Needs `socket.io`, the presence and rate-limit-store plugins, and a tenant claim in tokens. CORS origins must be configured explicitly. |
| `presence/` | Redis-backed online/last-seen tracking | Depends on `redis`. Not idempotent across crashes (counter may drift). |
| `rate-limit/` | Redis counter store + per-user middleware | Superseded for HTTP by `@fastify/rate-limit`; kept for WebSocket limits. |
| `multitenancy/` | Tenant resolver sketch | Fully commented out. |
| `streaming/` | Stream-to-user helper over realtime | Fully commented out. |

To promote one of these: add a manifest entry with `"stability": "experimental"` (refused in production), add tests, then move it under `src/plugins/`.
