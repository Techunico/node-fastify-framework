export const ErrorCodes = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_EXISTS: 'EMAIL_EXISTS',

  // System
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  NOT_READY: 'NOT_READY',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]