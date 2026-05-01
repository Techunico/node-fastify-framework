import { AuthService } from './auth.service'

declare module '@/types/services' {
  interface BaseServices {
    auth: AuthService
  }
}