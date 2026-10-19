import manifestJson from "../framework.manifest.json";

export type PluginStability = "stable" | "experimental";

export interface PluginManifestEntry {
  label: string;
  description: string;
  stability: PluginStability;
  /** Module path relative to src/plugins, loaded only when the plugin is enabled. */
  entry: string;
  /** Plugins that must also be enabled. */
  requires: string[];
  /** Plugins that are used when enabled; registered first if present. */
  optional: string[];
  /** npm packages the plugin imports at runtime. */
  dependencies: Record<string, string>;
  /** Paths (relative to the application root) owned by this plugin. */
  files: string[];
}

export interface FrameworkManifest {
  node: string;
  core: { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  databases: Record<
    string,
    {
      label: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      files: string[];
    }
  >;
  plugins: Record<string, PluginManifestEntry>;
}

export const manifest = manifestJson as FrameworkManifest;

export class PluginConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginConfigurationError";
  }
}

export interface ResolveOptions {
  nodeEnv?: string;
  plugins?: Record<string, PluginManifestEntry>;
}

/**
 * Validates the requested plugin names and returns them in registration
 * order (manifest order, which lists dependencies before dependants).
 *
 * Throws for unknown names, missing required plugins, and experimental
 * plugins in production.
 */
export function resolvePluginOrder(requested: string[], options: ResolveOptions = {}): string[] {
  const plugins = options.plugins ?? manifest.plugins;
  const known = Object.keys(plugins);
  const enabled = new Set(requested);

  const unknown = [...enabled].filter((name) => !known.includes(name));
  if (unknown.length) {
    throw new PluginConfigurationError(
      `Unknown plugin(s) in PLUGINS: ${unknown.join(", ")}. Available: ${known.join(", ")}`,
    );
  }

  for (const name of enabled) {
    const entry = plugins[name];
    const missing = entry.requires.filter((dependency) => !enabled.has(dependency));
    if (missing.length) {
      throw new PluginConfigurationError(
        `Plugin "${name}" requires ${missing.map((m) => `"${m}"`).join(", ")}. Add ${missing.length > 1 ? "them" : "it"} to PLUGINS.`,
      );
    }
    if (entry.stability === "experimental" && options.nodeEnv === "production") {
      throw new PluginConfigurationError(
        `Plugin "${name}" is experimental and cannot be enabled when NODE_ENV=production`,
      );
    }
  }

  return known.filter((name) => enabled.has(name));
}

/** Returns the npm packages of `name` that cannot be resolved from `fromDir`. */
export function findMissingPackages(
  entry: PluginManifestEntry,
  resolve: (request: string) => string = require.resolve,
): string[] {
  return Object.keys(entry.dependencies).filter((pkg) => {
    try {
      resolve(pkg);
      return false;
    } catch {
      return true;
    }
  });
}

/** Every plugin package (direct + required plugins) needed by a set of plugins. */
export function packagesFor(names: string[]): Record<string, string> {
  const packages: Record<string, string> = {};
  for (const name of names) {
    Object.assign(packages, manifest.plugins[name]?.dependencies ?? {});
  }
  return packages;
}
