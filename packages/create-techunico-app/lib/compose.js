const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PACKAGE_ROOT = path.join(__dirname, "..");
const DEFAULT_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "template");
const DEFAULT_ASSETS_DIR = path.join(PACKAGE_ROOT, "assets");
const DEFAULT_OVERLAYS_DIR = path.join(PACKAGE_ROOT, "overlays");

const DATABASES = ["postgresql", "mongodb"];
const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm"];

const DEFAULT_URLS = {
  postgresql: "postgresql://user:password@localhost:5432/db",
  mongodb: "mongodb://localhost:27017/db",
};

const RESERVED_NAMES = new Set(["node_modules", "favicon.ico", "template"]);

class GenerationError extends Error {}

function readManifest(templateDir = DEFAULT_TEMPLATE_DIR) {
  const manifestPath = path.join(templateDir, "src", "framework.manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new GenerationError(
      `Template is incomplete (missing ${path.relative(PACKAGE_ROOT, manifestPath)}). ` +
        "Run `npm run build:template` in the framework repository.",
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

/** Throws a GenerationError describing why `name` is not a safe project name. */
function validateProjectName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new GenerationError("Please provide a project name, e.g. `create-techunico-app my-api`");
  }
  if (name.length > 214) {
    throw new GenerationError("Project name must be at most 214 characters");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new GenerationError(
      `Invalid project name "${name}": use lowercase letters, digits, ".", "_" or "-", ` +
        "starting with a letter or digit (no paths or spaces).",
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new GenerationError(`"${name}" is a reserved name`);
  }
}

/** Resolves the destination directory and guarantees it is a direct child of `cwd`. */
function resolveTarget(cwd, name) {
  validateProjectName(name);
  const base = path.resolve(cwd);
  const target = path.resolve(base, name);
  if (path.dirname(target) !== base) {
    throw new GenerationError(`Refusing to create a project outside ${base}`);
  }
  return target;
}

/**
 * Returns `requested` plus every plugin they require (transitively), in
 * manifest order. Throws for unknown plugin names.
 */
function resolvePlugins(manifest, requested) {
  const known = Object.keys(manifest.plugins);
  const unknown = requested.filter((name) => !known.includes(name));
  if (unknown.length) {
    throw new GenerationError(
      `Unknown plugin(s): ${unknown.join(", ")}. Available: ${known.join(", ")}`,
    );
  }

  const selected = new Set();
  const visit = (name) => {
    if (selected.has(name)) return;
    selected.add(name);
    for (const dependency of manifest.plugins[name].requires) visit(dependency);
  };
  requested.forEach(visit);

  return known.filter((name) => selected.has(name));
}

function removePath(projectRoot, relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fullPath.startsWith(projectRoot + path.sep)) {
    throw new GenerationError(`Refusing to remove path outside the project: ${relativePath}`);
  }
  fs.rmSync(fullPath, { recursive: true, force: true });
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function generateSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

function setEnvValue(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, () => `${key}=${value}`);
  }
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function removeEnvKey(content, key) {
  return content
    .split("\n")
    .filter((line) => !line.startsWith(`${key}=`))
    .join("\n");
}

function sortedObject(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function buildPackageJson(basePackage, manifest, { name, db, plugins }) {
  const database = manifest.databases[db];

  const dependencies = { ...manifest.core.dependencies, ...database.dependencies };
  for (const plugin of plugins) {
    Object.assign(dependencies, manifest.plugins[plugin].dependencies);
  }

  const devDependencies = { ...manifest.core.devDependencies, ...database.devDependencies };

  const scripts = { ...basePackage.scripts };
  if (db === "postgresql") {
    // The generated Prisma client is JavaScript, so tsc does not emit it.
    scripts.build = `${scripts.build} && node -e "require('fs').cpSync('src/generated','dist/generated',{recursive:true})"`;
    Object.assign(scripts, {
      generate: "prisma generate",
      migrate: "prisma migrate dev",
      "migrate:deploy": "prisma migrate deploy",
      seed: "ts-node prisma/seed.ts",
    });
  }
  if (db === "mongodb") {
    scripts.seed = "ts-node -r tsconfig-paths/register scripts/seed.ts";
  }

  return {
    ...basePackage,
    name,
    version: "0.1.0",
    private: true,
    engines: { node: manifest.node },
    scripts,
    dependencies: sortedObject(dependencies),
    devDependencies: sortedObject(devDependencies),
  };
}

function configureEnvironment(projectRoot, { db, plugins }) {
  const examplePath = path.join(projectRoot, ".env.example");
  if (!fs.existsSync(examplePath)) {
    throw new GenerationError("Template is incomplete (missing .env.example)");
  }

  const otherUrlKey = db === "postgresql" ? "MONGO_URI" : "DATABASE_URL";
  const urlKey = db === "postgresql" ? "DATABASE_URL" : "MONGO_URI";

  let example = fs.readFileSync(examplePath, "utf-8");
  example = setEnvValue(example, "DB_PROVIDER", db);
  example = removeEnvKey(example, otherUrlKey);
  example = setEnvValue(example, urlKey, DEFAULT_URLS[db]);
  fs.writeFileSync(examplePath, example);

  // .env gets fresh random secrets; .env.example keeps them blank.
  let env = setEnvValue(example, "PLUGINS", plugins.join(","));
  env = setEnvValue(env, "JWT_SECRET", generateSecret());
  env = setEnvValue(env, "JWT_ADMIN_SECRET", generateSecret());

  const envPath = path.join(projectRoot, ".env");
  fs.writeFileSync(envPath, env, { mode: 0o600 });
}

/**
 * Creates a new application in `target` (which must not exist).
 * On failure, the partially generated directory is removed.
 */
function generateProject(options) {
  const {
    target,
    name,
    db,
    plugins: requestedPlugins = [],
    templateDir = DEFAULT_TEMPLATE_DIR,
    assetsDir = DEFAULT_ASSETS_DIR,
    overlaysDir = DEFAULT_OVERLAYS_DIR,
  } = options;

  if (!DATABASES.includes(db)) {
    throw new GenerationError(`Unsupported database "${db}". Use one of: ${DATABASES.join(", ")}`);
  }
  if (fs.existsSync(target)) {
    throw new GenerationError(`Folder already exists: ${target}`);
  }

  const manifest = readManifest(templateDir);
  const plugins = resolvePlugins(manifest, requestedPlugins);

  fs.mkdirSync(target, { recursive: false });

  try {
    copyDirectory(templateDir, target);

    // npm strips files named .gitignore from published packages.
    const shippedGitignore = path.join(target, "_gitignore");
    if (fs.existsSync(shippedGitignore)) {
      fs.renameSync(shippedGitignore, path.join(target, ".gitignore"));
    }

    // Database composition: drop the other database's files, apply overlay.
    for (const other of DATABASES.filter((candidate) => candidate !== db)) {
      for (const file of manifest.databases[other].files) removePath(target, file);
    }
    copyDirectory(path.join(overlaysDir, db), target);

    if (db === "postgresql") {
      const prismaAssets = path.join(assetsDir, "prisma");
      fs.mkdirSync(path.join(target, "prisma"), { recursive: true });
      fs.copyFileSync(
        path.join(prismaAssets, "schema.postgresql.prisma"),
        path.join(target, "prisma", "schema.prisma"),
      );
      fs.copyFileSync(path.join(prismaAssets, "seed.ts"), path.join(target, "prisma", "seed.ts"));
      fs.copyFileSync(
        path.join(prismaAssets, "prisma.config.ts.template"),
        path.join(target, "prisma.config.ts"),
      );
    }

    // Only enabled plugins are copied; their npm packages are the only ones installed.
    for (const [plugin, entry] of Object.entries(manifest.plugins)) {
      if (!plugins.includes(plugin)) {
        for (const file of entry.files) removePath(target, file);
      }
    }

    const packagePath = path.join(target, "package.json");
    const basePackage = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
    const pkg = buildPackageJson(basePackage, manifest, { name, db, plugins });
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

    configureEnvironment(target, { db, plugins });

    return { target, db, plugins, packageJson: pkg };
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  DATABASES,
  PACKAGE_MANAGERS,
  GenerationError,
  generateProject,
  generateSecret,
  readManifest,
  resolvePlugins,
  resolveTarget,
  validateProjectName,
};
