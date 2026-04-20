import fp from "fastify-plugin";
import { Server } from "socket.io";
import { RealtimeService } from "./realtime.service";
import jwt from "jsonwebtoken";
import { config } from "@/config";
import { AuthenticatedSocket } from "./realtime.types";

declare module "fastify" {
  interface FastifyInstance {
    realtime: RealtimeService;
  }
}

export default fp(async (app) => {
  const io = new Server(app.server, {
    cors: {
      origin: "*",
    },
  });

  const realtime = new RealtimeService(io);

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const user = socket.user;

    if (!user) return;

    const key = `ratelimit:ws:${user.tenantId}:${user.id}:send-message`;

    const result = await app.rateLimit.hit(key, 20, 60);

    if (!result.allowed) {
      return socket.emit("error", "Rate limit exceeded");
    }

    // ✅ Safe rooms (server-controlled only)
    socket.join(`user:${user.id}`);
    socket.join(`tenant:${user.tenantId}`);

    await app.presence.userConnected(user.id, user.tenantId);

    // 🔥 broadcast online status
    app.realtime.emitToTenant(user.tenantId, "presence:online", {
      userId: user.id,
    });

    // Example: join user room
    socket.on("join:user", (userId) => {
      //   socket.join(`user:${userId}`);
      socket.join(`user:${user.id}`);
      socket.join(`tenant:${user.tenantId}`);
    });

    socket.on("disconnect", async () => {
      await app.presence.userDisconnected(user.id, user.tenantId);

      const isStillOnline = await app.presence.isOnline(user.id);

      if (!isStillOnline) {
        app.realtime.emitToTenant(user.tenantId, "presence:offline", {
          userId: user.id,
        });
      }
    });
  });

  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as any;

      socket.user = {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role,
      };

      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  app.decorate("realtime", realtime);
});
