// export class TenancyService {
//   constructor(private app: FastifyInstance) {}

//   resolveTenant(request): { id: string } | null {
//     for (const resolver of this.app.tenancyResolvers) {
//       const tenant = resolver.resolve(request);
//       if (tenant) return tenant;
//     }

//     return null;
//   }
// }