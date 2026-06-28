import { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '@/utils/app-error'

type JwtPayload = {
  id: string
  role?: string
  permissions?: string[]
  type?: string
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization

  // ✅ Validate header presence
  if (!authHeader) {
    request.log.warn('Missing Authorization header')
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  // ✅ Validate format: Bearer <token>
  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    request.log.warn({ authHeader }, 'Invalid Authorization format')
    throw new AppError('Invalid token format', 401, 'INVALID_TOKEN')
  }

  try {
    const decoded = request.server.jwt.verifyAccess(token) as JwtPayload

    // ✅ Attach user to request context
    request.ctx.user = {
      id: decoded.id,
      role: decoded.role,
      permissions: decoded.permissions,
      type: (decoded as any).userType || decoded.type, // Support both for safety
    }

    // ✅ Enrich logger with user + request context
    request.log = request.log.child({
      userId: decoded.id,
      role: decoded.role,
      type: decoded.type,
      requestId: request.ctx.requestId,
    })

    request.log.debug('User authenticated')
  } catch (error) {
    request.log.warn({ error }, 'Token verification failed')
    throw new AppError('Invalid token', 401, 'INVALID_TOKEN')
  }
}