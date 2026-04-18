import { FastifyRequest, FastifyReply } from "fastify";
import { ZodSchema } from "zod";
import { AppError } from "@/utils/app-error";

export function validateQuery(schema: ZodSchema) {
  return async function (request: FastifyRequest) {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      throw new AppError("Invalid query", 400, "VALIDATION_ERROR");
    }

    request.query = result.data;
  };
}

export function validateParams(schema: ZodSchema) {
  return async function (request: FastifyRequest) {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      throw new AppError("Invalid params", 400, "VALIDATION_ERROR");
    }

    request.params = result.data;
  };
}
