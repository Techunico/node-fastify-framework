import * as fs from "fs";
import * as path from "path";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { toCamelCase, toKebabCase } from "@/utils/string/case";

/** Mounted at the root instead of under API_PREFIX/API_VERSION. */
const SYSTEM_MODULES = new Set(["health", "metrics"]);

export class ModuleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLoadError";
  }
}

/**
 * Registers every module in src/modules/<name>/index.(ts|js).
 *
 * A module exports its Fastify plugin either as `default` or as
 * `<camelCaseName>Module` (e.g. `order-items` → `orderItemsModule`).
 * Directories starting with "_" are skipped (templates/examples).
 */
export async function registerModules(app: FastifyInstance) {
  const modulesPath = path.resolve(__dirname, "..", "modules");
  if (!fs.existsSync(modulesPath)) return;

  const moduleDirs = fs
    .readdirSync(modulesPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
  const basePrefix = `${app.config.app.api.prefix}/${app.config.app.api.version}`;
  const moduleFileName = path.extname(__filename) === ".js" ? "index.js" : "index.ts";

  for (const dir of moduleDirs) {
    const modulePath = path.join(modulesPath, dir, moduleFileName);

    if (!fs.existsSync(modulePath)) continue;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleImport = require(modulePath) as Record<string, unknown>;
    const exportName = `${toCamelCase(dir)}Module`;
    const moduleFunction = (moduleImport[exportName] ?? moduleImport.default) as FastifyPluginAsync | undefined;

    if (typeof moduleFunction !== "function") {
      throw new ModuleLoadError(
        `Module "${dir}" (${path.relative(process.cwd(), modulePath)}) must export a Fastify plugin as "${exportName}" or default`,
      );
    }

    const prefix = SYSTEM_MODULES.has(dir) ? "" : `${basePrefix}/${toKebabCase(dir)}`;

    await app.register(moduleFunction, { prefix });

    app.log.debug({ module: dir, prefix: prefix || "/" }, "Module loaded");
  }
}
