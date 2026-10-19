import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@/utils/app-error";

/**
 * Framework error contract.
 *
 * Every error response uses the envelope
 *   { success: false, data: null, error: { type, message, details? } }
 *
 * - AppError and any error carrying a numeric `statusCode` (Fastify errors,
 *   plugin errors such as GeoError / CloudinaryError / PaymentError) keep
 *   their status; `type` is the error's `code` when it has one.
 * - 4xx messages are written by the framework or the application and are
 *   returned to the client.
 * - 5xx messages are internal: returned only outside production; logged
 *   (without request bodies or credentials) in every environment.
 */

type ErrorBody = {
  success: false;
  data: null;
  error: { type: string; message: string; details?: unknown };
};

function envelope(type: string, message: string, details?: unknown): ErrorBody {
  return {
    success: false,
    data: null,
    error: details === undefined ? { type, message } : { type, message, details },
  };
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && status >= 400 && status < 600 ? status : undefined;
}

function codeOf(error: unknown, fallback: string): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.length > 0 ? code : fallback;
}

export function setupErrorHandler(app: FastifyInstance) {
  const production = () => app.config?.app.env === "production";

  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      request.log.warn({ issues: error.issues.length }, "Validation failed");

      return reply.status(400).send(
        envelope(
          "VALIDATION_ERROR",
          "Request validation failed",
          error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        ),
      );
    }

    if (error instanceof AppError) {
      (error.statusCode >= 500 ? request.log.error : request.log.warn).call(request.log, { err: error }, error.message);
      if (error.statusCode === 429 && "retryAfter" in error) {
        reply.header("retry-after", String((error as { retryAfter?: unknown }).retryAfter));
      }

      return reply.status(error.statusCode).send(envelope(error.type, error.message));
    }

    const status = statusOf(error);
    const message = error instanceof Error ? error.message : "Something went wrong";

    if (status !== undefined && status < 500) {
      request.log.warn({ err: error }, message);
      return reply.status(status).send(envelope(codeOf(error, "HTTP_ERROR"), message));
    }

    const finalStatus = status ?? 500;
    request.log.error({ err: error }, "Request failed");

    return reply
      .status(finalStatus)
      .send(
        envelope(
          codeOf(error, "INTERNAL_SERVER_ERROR"),
          production() ? "Something went wrong" : message,
        ),
      );
  });

  app.setNotFoundHandler((request, reply) => {
    // Never echo the URL (it may carry tokens in the query string).
    return reply.status(404).send(envelope("NOT_FOUND", `Route ${request.method} not found`));
  });
}
