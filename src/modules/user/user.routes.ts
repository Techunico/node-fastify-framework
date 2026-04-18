import { FastifyInstance } from "fastify";
import { UserController } from "./user.controller";

export async function userRoutes(app: FastifyInstance) {
  const controller = new UserController();

  app.post("/", controller.createUser.bind(controller));
}
