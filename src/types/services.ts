import type { AuthService } from "@/modules/auth/auth.service";
import type { UserService } from "@/modules/user/user.service";

/**
 * Services available as `app.services` and `request.services`.
 * Add an entry here when a module registers a new service in
 * src/plugins/services.plugin.ts.
 */
export interface Services {
  auth: AuthService;
  users: UserService;
}
