import fp from "fastify-plugin";
import { AuthService } from "@/modules/auth/auth.service";
import { UserRepository } from "@/modules/user/user.repository";
import { UserService } from "@/modules/user/user.service";
import type { Services } from "@/types/services";

export interface ServicesPluginOptions {
  /** Replace individual services (tests). */
  overrides?: Partial<Services>;
}

/**
 * Application service container. Services are stateless and built once;
 * `request.services` exposes the same instances to route handlers.
 */
export default fp(async (app, options: ServicesPluginOptions) => {
  const users = new UserRepository(app.db);

  const services: Services = {
    auth: new AuthService(users),
    users: new UserService(users),
    ...options.overrides,
  };

  app.decorate("services", services);
  app.decorateRequest("services", {
    getter() {
      return services;
    },
  });
}, { name: "services" });
