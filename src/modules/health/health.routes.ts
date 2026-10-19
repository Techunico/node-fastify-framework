import { FastifyInstance } from "fastify";
import { toSafeCause } from "@/core/safe-error";

export async function healthRoutes(app: FastifyInstance) {
  // Liveness
  app.get("/health", async (request, reply) => {
    return reply.success({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // Readiness: database plus every check contributed by enabled plugins.
  app.get("/ready", async (request, reply) => {
    const { ready, checks, errors } = await app.readiness.run();

    for (const [name, err] of Object.entries(errors)) {
      request.log.error({ err: toSafeCause(err), check: name }, "Readiness check failed");
    }

    return reply.status(ready ? 200 : 503).send({
      success: ready,
      data: {
        status: ready ? "ready" : "degraded",
        checks,
      },
      error: ready
        ? null
        : {
            type: "NOT_READY",
            message: "One or more services are not ready",
          },
    });
  });
}
