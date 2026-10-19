import { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { DatabaseAdapter } from "@/core/interfaces/database";
import type { Services } from "@/types/services";

// core plugins
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";
import securityPlugin from "./security.plugin";

import databasePlugin, { databaseProvider } from "./database";
import { ReadinessRegistry } from "@/core/readiness";
import {
  findMissingPackages,
  manifest,
  PluginConfigurationError,
  resolvePluginOrder,
} from "./manifest";

interface PluginModule {
  default: FastifyPluginAsync<{ config?: unknown }>;
  /** Validates the plugin's own environment variables; called only when the plugin is enabled. */
  loadConfig?: (env: Readonly<Record<string, string | undefined>>) => unknown;
}

/**
 * Loads an optional plugin. The import is deferred and its path is not a
 * literal, so a disabled plugin's code (and npm packages) is never loaded and
 * its directory may be absent from a generated application.
 */
async function loadOptionalPlugin(name: string): Promise<PluginModule> {
  const entry = manifest.plugins[name];

  const missingPackages = findMissingPackages(entry);
  if (missingPackages.length) {
    const install = missingPackages
      .map((pkg) => `${pkg}@${entry.dependencies[pkg]}`)
      .join(" ");
    throw new PluginConfigurationError(
      `Plugin "${name}" is enabled but its packages are not installed: ${missingPackages.join(", ")}. ` +
        `Install them with: npm install ${install}`,
    );
  }

  const specifier = `./${entry.entry}`;
  let loaded: PluginModule;
  try {
    loaded = (await import(specifier)) as PluginModule;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "MODULE_NOT_FOUND" && String((error as Error).message).includes(entry.entry)) {
      throw new PluginConfigurationError(
        `Plugin "${name}" is enabled but its source files are missing (${entry.files.join(", ")}). ` +
          "Add the plugin's files from the framework template or remove it from PLUGINS.",
      );
    }
    throw error;
  }

  if (typeof loaded.default !== "function") {
    throw new PluginConfigurationError(`Plugin "${name}" (${specifier}) has no default export`);
  }
  return loaded;
}

export interface RegisterPluginsOptions {
  /**
   * Use this adapter as `app.db` instead of registering the database plugin
   * (tests). It is used as-is: not connected or closed by the framework.
   */
  database?: DatabaseAdapter;
  /** Replace service implementations (tests). */
  services?: Partial<Services>;
}

export async function registerPlugins(app: FastifyInstance, options: RegisterPluginsOptions = {}) {
  const { config } = app;

  // 🔌 DB Plugin
  if (config.db.provider !== databaseProvider) {
    throw new PluginConfigurationError(
      `DB_PROVIDER=${config.db.provider} does not match this application's database binding (${databaseProvider}). ` +
        "See src/plugins/database.ts.",
    );
  }
  app.decorate("readiness", new ReadinessRegistry());

  if (options.database) {
    app.decorate("db", options.database as FastifyInstance["db"]);
  } else {
    await app.register(databasePlugin);
  }
  app.readiness.add("database", () => app.db.ping());

  // 🧠 Core plugins (order matters)
  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin, { overrides: options.services });

  // 🔌 Optional plugins (driven by PLUGINS env), validated and ordered by the manifest
  const ordered = resolvePluginOrder(config.app.plugins, { nodeEnv: config.app.env });

  for (const name of ordered) {
    const plugin = await loadOptionalPlugin(name);
    const pluginConfig = plugin.loadConfig?.(config.source);
    await app.register(plugin.default, pluginConfig === undefined ? {} : { config: pluginConfig });
  }

  // 🛡️ HTTP safeguards last, so they can use optional plugins (redis store).
  await app.register(securityPlugin);
}
