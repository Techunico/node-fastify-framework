import fp from "fastify-plugin";

/**
 * Request context. `request.id` (and the `requestId` log label) comes from
 * Fastify's genReqId (see src/app.ts); it is echoed as `x-request-id` so
 * clients and upstream proxies can correlate logs.
 */
export default fp(async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    request.ctx = { requestId: request.id };
    reply.header("x-request-id", request.id);
  });
}, { name: "context" });
