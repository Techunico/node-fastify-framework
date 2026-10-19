/**
 * Structured-log redaction. Paths cover Fastify's request serializer
 * (`req.headers.*`) and common secret-bearing fields one level deep in any
 * logged object. Fastify's default serializers already omit request bodies.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'authorization',
  'authHeader',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'apiSecret',
  'keySecret',
  'webhookSecret',
  '*.authorization',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.apiSecret',
  '*.keySecret',
  '*.webhookSecret',
]

export const loggerRedaction = {
  paths: REDACT_PATHS,
  censor: '[REDACTED]',
}
