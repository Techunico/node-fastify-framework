import { PrismaClient } from '@/generated/prisma/client'
import { RequestContext } from './request-context'

// import services
import { AuthService } from '@/modules/auth/auth.service'

export interface Services {
  prisma: PrismaClient
  auth: AuthService
}