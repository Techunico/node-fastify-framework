import fs from "fs";
import path from "path";
import { listRegisteredModels } from "./register-model";

type ModelLoaderLogger = {
  info: (obj: object | string, msg?: string) => void;
  warn: (obj: object | string, msg?: string) => void;
  debug?: (obj: object | string, msg?: string) => void;
};

export interface RegisterModelsOptions {
  /**
   * Extra absolute directories to scan for model files (name ends with .model.ts or .model.js).
   * Defaults already include:
   *   - (src|dist)/modules/<module>/
   *   - (src|dist)/models/ (and one level of subdirs)
   */
  extraDirs?: string[];
  logger?: ModelLoaderLogger;
  /**
   * When true (default), missing modules/models roots are skipped instead of throwing.
   * Keeps empty scaffolds bootable.
   */
  softMissingRoots?: boolean;
}

/**
 * Register all Mongoose models by side-effect import of .model.js or .model.ts files.
 *
 * Resolves paths relative to this file (works for both):
 *   - dev:  src/plugins/db-mongoose -> src/modules, src/models
 *   - prod: dist/plugins/db-mongoose -> dist/modules, dist/models
 *
 * Never hardcode process.cwd() + "src/modules" — that breaks when
 * cwd differs from the compiled layout.
 *
 * Uses require() for both dev (ts-node) and compiled JS. Dynamic import() of
 * file:// URLs fails under "module": "CommonJS" because TS downlevels import()
 * to require(), and require() cannot resolve file:// specifiers.
 *
 * Models should use registerModel() from @/plugins/db-mongoose/register-model so double
 * loads (hot reload / loader re-entry) are safe.
 */
export async function registerModels(
  options: RegisterModelsOptions = {},
): Promise<string[]> {
  const logger = options.logger;
  const soft = options.softMissingRoots !== false;
  const before = new Set(listRegisteredModels());

  // src/plugins/db-mongoose → src (or dist/plugins/db-mongoose → dist)
  const root = path.resolve(__dirname, "..", "..");
  const isCompiled = path.extname(__filename) === ".js";
  const modelSuffix = isCompiled ? ".model.js" : ".model.ts";

  const modulesPath = path.join(root, "modules");
  const modelsPath = path.join(root, "models");

  const files = collectModelFiles(modulesPath, modelsPath, modelSuffix, soft, logger);

  for (const dir of options.extraDirs ?? []) {
    if (!fs.existsSync(dir)) {
      if (!soft) {
        throw new Error(`Model loader: extra directory not found at ${dir}`);
      }
      logger?.warn?.({ dir }, "Model loader: extra directory missing — skipped");
      continue;
    }
    files.push(...listModelFilesInDir(dir, modelSuffix, true));
  }

  const uniqueFiles = [...new Set(files)];

  for (const fullPath of uniqueFiles) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(fullPath);
  }

  const after = listRegisteredModels();
  const added = after.filter((name) => !before.has(name));

  logger?.info?.(
    {
      scanned: uniqueFiles.length,
      registered: after.length,
      added: added.length,
      models: after,
    },
    "Mongoose models registered",
  );

  if (!logger) {
    const suffix = added.length ? `: ${added.join(", ")}` : "";
    console.log(`Models registered (${after.length})${suffix}`);
  }

  return after;
}

function collectModelFiles(
  modulesPath: string,
  modelsPath: string,
  modelSuffix: string,
  soft: boolean,
  logger?: ModelLoaderLogger,
): string[] {
  const files: string[] = [];

  if (fs.existsSync(modulesPath)) {
    for (const moduleName of fs.readdirSync(modulesPath)) {
      const modulePath = path.join(modulesPath, moduleName);
      if (!fs.statSync(modulePath).isDirectory()) continue;
      if (moduleName.startsWith("_")) continue;
      files.push(...listModelFilesInDir(modulePath, modelSuffix, false));
    }
  } else if (!soft) {
    throw new Error(
      `Model loader: modules directory not found at ${modulesPath}`,
    );
  } else {
    logger?.debug?.(
      { modulesPath },
      "Model loader: modules directory not found — skipped",
    );
  }

  if (fs.existsSync(modelsPath)) {
    files.push(...listModelFilesInDir(modelsPath, modelSuffix, true));
  }

  return files;
}

/**
 * @param recursive when true, also scan one level of subdirectories
 *   (supports src/models/rbac/foo.model.ts style layouts).
 */
function listModelFilesInDir(
  dir: string,
  modelSuffix: string,
  recursive: boolean,
): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(modelSuffix)) {
      results.push(full);
      continue;
    }
    if (recursive && entry.isDirectory() && !entry.name.startsWith("_")) {
      for (const nested of fs.readdirSync(full)) {
        if (nested.endsWith(modelSuffix)) {
          results.push(path.join(full, nested));
        }
      }
    }
  }

  return results;
}
