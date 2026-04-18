export interface RequestContext {
  requestId: string
  user?: {
    id: number
    role?: string
    permissions?: string[]
  }
}