import { FastifyRequest } from "fastify";
import { z, ZodSchema } from "zod";

function buildValidationError(result: z.ZodSafeParseError<unknown>) {
  return new z.ZodError(result.error.issues);
}

function validateRequestPart<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw buildValidationError(result);
  }

  return result.data;
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest) {
    request.body = validateRequestPart(schema, request.body);
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest) {
    request.query = validateRequestPart(schema, request.query);
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest) {
    request.params = validateRequestPart(schema, request.params);
  };
}
