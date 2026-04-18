import { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@/utils/app-error";

// Type guard
function isFastifyError(error: unknown): error is FastifyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as any).statusCode === "number"
  );
}

// Helper
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function setupErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn(error);

      return reply.status(400).send({
        success: false,
        data: null,
        error: {
          type: "VALIDATION_ERROR",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      request.log.warn(error);

      return reply.status(error.statusCode).send({
        success: false,
        data: null,
        error: {
          type: error.type,
          message: error.message,
        },
      });
    }

    if (isFastifyError(error)) {
      request.log.warn(error);

      const statusCode =
        error.statusCode && error.statusCode >= 400 && error.statusCode < 600
          ? error.statusCode
          : 500;

      return reply.status(statusCode).send({
        success: false,
        data: null,
        error: {
          type: "HTTP_ERROR",
          message: error.message,
        },
      });
    }

    request.log.error(error);

    return reply.status(500).send({
      success: false,
      data: null,
      error: {
        type: "INTERNAL_SERVER_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "Something went wrong"
            : getErrorMessage(error),
      },
    });
  });
}
