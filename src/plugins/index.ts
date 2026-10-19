import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { config } from "@/config";

// core plugins
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";

import databasePlugin, { databaseProvider } from "./database";
import { ReadinessRegistry } from "@/core/readiness";
import {
  findMissingPackages,
  manifest,
  PluginConfigurationError,
  resolvePluginOrder,
} from "./manifest";

interface PluginModule {
  default: FastifyPluginAsync;
}

/**
 * Loads an optional plugin. The import is deferred and its path is not a
 * literal, so a disabled plugin's code (and npm packages) is never loaded and
 * its directory may be absent from a generated application.
 */
async function loadOptionalPlugin(name: string): Promise<FastifyPluginAsync> {
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
  return loaded.default;
}

export async function registerPlugins(app: FastifyInstance) {
  // 🔌 DB Plugin
  if (config.db.provider !== databaseProvider) {
    throw new PluginConfigurationError(
      `DB_PROVIDER=${config.db.provider} does not match this application's database binding (${databaseProvider}). ` +
        "See src/plugins/database.ts.",
    );
  }
  app.decorate("readiness", new ReadinessRegistry());

  await app.register(databasePlugin);
  app.readiness.add("database", () => app.db.ping());

  // 🧠 Core plugins (order matters)
  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);

  // 🔌 Optional plugins (driven by PLUGINS env), validated and ordered by the manifest
  const ordered = resolvePluginOrder(config.app.plugins, { nodeEnv: config.app.env });

  for (const name of ordered) {
    const plugin = await loadOptionalPlugin(name);
    await app.register(plugin);
  }
}
