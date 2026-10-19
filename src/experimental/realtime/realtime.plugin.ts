import fp from "fastify-plugin";
import { Server } from "socket.io";
import { RealtimeService } from "./realtime.service";
import { AuthenticatedSocket } from "./realtime.types";
import { requireDecorator } from "@/core/require-decorator";

declare module "fastify" {
  interface FastifyInstance {
    realtime?: RealtimeService;
  }
}

export interface RealtimePluginOptions {
  /** Allowed browser origins. Required; there is no wildcard default. */
  corsOrigins: string[];
}

/**
 * EXPERIMENTAL — not registered by the framework and not shipped in generated
 * applications. Requires the experimental presence and rate-limit plugins.
 */
export default fp(async (app, options: RealtimePluginOptions) => {
  const presence = requireDecorator(app, "presence", "realtime");
  const rateLimitStore = requireDecorator(app, "rateLimitStore", "realtime");

  const io = new Server(app.server, {
    cors: {
      origin: options.corsOrigins,
    },
  });

  const realtime = new RealtimeService(io);

  // Authenticate with the same hardened verifier as HTTP routes: access
  // tokens only, configured keys, issuer/audience/expiry checks.
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = app.jwt.verifyAccess(token);

      socket.user = {
        id: String(decoded.id),
        tenantId: typeof decoded.tenantId === "string" ? decoded.tenantId : "default",
        role: decoded.role ?? undefined,
      };

      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const user = socket.user;

    if (!user) return;

    const key = `ratelimit:ws:${user.tenantId}:${user.id}:send-message`;

    const result = await rateLimitStore.hit(key, 20, 60);

    if (!result.allowed) {
      return socket.emit("error", "Rate limit exceeded");
    }

    // ✅ Safe rooms (server-controlled only)
    socket.join(`user:${user.id}`);
    socket.join(`tenant:${user.tenantId}`);

    await presence.userConnected(user.id, user.tenantId);

    realtime.emitToTenant(user.tenantId, "presence:online", {
      userId: user.id,
    });

    socket.on("disconnect", async () => {
      await presence.userDisconnected(user.id, user.tenantId);

      const isStillOnline = await presence.isOnline(user.id);

      if (!isStillOnline) {
        realtime.emitToTenant(user.tenantId, "presence:offline", {
          userId: user.id,
        });
      }
    });
  });

  app.decorate("realtime", realtime);

  app.addHook("onClose", async () => {
    await io.close();
  });
}, { name: "realtime", dependencies: ["presence", "rate-limit-store"] });
