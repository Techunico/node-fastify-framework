import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  // Liveness
  app.get("/health", async (request, reply) => {
    return reply.success({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // Readiness
  app.get("/ready", async (request, reply) => {
    const checks: Record<string, { status: "ok" | "fail"; message?: string }> =
      {};

    // Database check
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok" };
    } catch (err) {
      request.log.error(err);
      checks.database = { status: "fail", message: "Database unreachable" };
    }

    // Redis check
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

    // Add more services here the same way:
    // checks.s3 = { status: 'ok' }
    // checks.thirdPartyApi = { status: 'fail', message: '...' }

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
