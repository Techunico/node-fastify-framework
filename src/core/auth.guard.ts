import { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '@/utils/app-error'
import { JwtError, UserType } from '@/core/jwt'

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization

  if (!authHeader) {
    request.log.warn('Missing Authorization header')
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  // Never log the header itself: it carries the credential.
  const [scheme, token, ...rest] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    request.log.warn({ scheme: scheme?.slice(0, 16) }, 'Invalid Authorization format')
    throw new AppError('Invalid token format', 401, 'INVALID_TOKEN')
  }

  let decoded
  try {
    decoded = request.server.jwt.verifyAccess(token)
  } catch (error) {
    const code = error instanceof JwtError ? error.code : 'INVALID_TOKEN'
    request.log.warn({ reason: code }, 'Token verification failed')
    throw code === 'TOKEN_EXPIRED'
      ? new AppError('Token expired', 401, 'TOKEN_EXPIRED')
      : new AppError('Invalid token', 401, 'INVALID_TOKEN')
  }

  request.ctx.user = {
    id: String(decoded.id),
    role: decoded.role ?? undefined,
    permissions: decoded.permissions ?? [],
    type: decoded.userType,
  }

  request.log = request.log.child({
    userId: request.ctx.user.id,
    userType: decoded.userType,
  })

  request.log.debug('User authenticated')
}

export interface AuthorizeOptions {
  /** The authenticated user must have one of these token user types. */
  userTypes?: UserType[]
  /** The authenticated user must have one of these roles. */
  roles?: string[]
  /** The authenticated user must have every one of these permissions. */
  permissions?: string[]
}

/**
 * Authorization check to run after `authGuard`.
 *
 * Token classification (userType) and authorization are separate: an admin
 * token does not bypass role or permission requirements.
 */
export function authorize(options: AuthorizeOptions) {
  return async function authorizeGuard(request: FastifyRequest) {
    const user = request.ctx.user

    if (!user) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
    }

    const userTypeAllowed =
      !options.userTypes || options.userTypes.includes(user.type as UserType)
    const roleAllowed =
      !options.roles || (user.role !== undefined && options.roles.includes(user.role))
    const permissionsAllowed =
      !options.permissions ||
      options.permissions.every((permission) => user.permissions?.includes(permission))

    if (!userTypeAllowed || !roleAllowed || !permissionsAllowed) {
      request.log.warn({ userId: user.id }, 'Authorization denied')
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}
