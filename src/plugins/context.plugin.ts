import fp from "fastify-plugin";
import { randomUUID } from "crypto";

export default fp(async (app) => {
  app.addHook("onRequest", async (request) => {
    const requestId = randomUUID();

    request.ctx = { requestId };

    //   request.ctx.tenant = {
    //   id: string;
    // };

    request.log = request.log.child({ requestId });
  });
});
