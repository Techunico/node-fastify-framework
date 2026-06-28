export interface RequestContext {
  requestId: string;
  user?: {
    id: string;
    role?: string;
    permissions?: string[];
    type?: string;
  };
}
