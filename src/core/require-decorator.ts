import type { FastifyInstance } from "fastify";

/**
 * Returns an optional decorator that a plugin depends on, or throws a clear
 * startup error naming both plugins. Use inside plugin registration only.
 */
export function requireDecorator<K extends keyof FastifyInstance>(
  app: FastifyInstance,
  name: K,
  requiredBy: string,
): NonNullable<FastifyInstance[K]> {
  const value = app.hasDecorator(name as string) ? app[name] : undefined;
  if (value === undefined || value === null) {
    throw new Error(
      `Plugin "${requiredBy}" requires "${String(name)}" to be registered first. Add it to PLUGINS.`,
    );
  }
  return value as NonNullable<FastifyInstance[K]>;
}
