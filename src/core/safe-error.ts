/**
 * Diagnostic summary of an upstream (SDK / HTTP client) error that is safe to
 * keep on a framework error and to log.
 *
 * Provider errors such as AxiosError carry the full request configuration
 * (URLs with `key=` query params, auth headers, request bodies). Only the
 * fields below are kept; everything else is dropped.
 */
export interface SafeErrorCause {
  name?: string;
  message?: string;
  code?: string | number;
  status?: number;
}

const SECRET_QUERY_PARAM = /([?&](?:key|api_key|apikey|token|access_token|signature|secret)=)[^&\s]*/gi;

/** Removes secret-looking query parameters from free text such as error messages. */
export function scrubSecrets(text: string): string {
  return text.replace(SECRET_QUERY_PARAM, "$1[REDACTED]");
}

export function toSafeCause(error: unknown): SafeErrorCause | undefined {
  if (error === undefined || error === null) return undefined;

  if (typeof error !== "object") {
    return { message: scrubSecrets(String(error)) };
  }

  const source = error as Record<string, unknown>;
  const response = source.response as Record<string, unknown> | undefined;

  const status =
    typeof response?.status === "number"
      ? response.status
      : typeof source.statusCode === "number"
        ? source.statusCode
        : typeof source.http_code === "number"
          ? source.http_code
          : undefined;

  const code =
    typeof source.code === "string" || typeof source.code === "number" ? source.code : undefined;

  return {
    name: typeof source.name === "string" ? source.name : undefined,
    message: typeof source.message === "string" ? scrubSecrets(source.message) : undefined,
    code,
    status,
  };
}
