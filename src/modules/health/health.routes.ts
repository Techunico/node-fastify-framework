import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (request, reply) => {
    return reply.success({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  app.get("/ready", async (request, reply) => {
    const checks: Record<string, { status: "ok" | "fail"; message?: string }> =
      {};

    const database = await request.server.db.healthCheck();
    checks.database = database;

    if (app.redis) {
      try {
        const pong = await app.redis.ping();
        checks.redis =
          pong === "PONG"
            ? { status: "ok" }
            : { status: "fail", message: `Unexpected ping response: ${pong}` };
      } catch (err) {
        request.log.error(err);
        checks.redis = { status: "fail", message: "Redis unreachable" };
      }
    }

    const allReady = Object.values(checks).every((c) => c.status === "ok");

    return reply.status(allReady ? 200 : 503).send({
      success: allReady,
      data: {
        status: allReady ? "ready" : "degraded",
        checks,
      },
      error: allReady
        ? null
        : {
            type: "NOT_READY",
            message: "One or more services are not ready",
          },
    });
  });
}