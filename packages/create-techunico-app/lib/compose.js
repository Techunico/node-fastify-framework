const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PRISMA_ARTIFACTS = [
  "prisma",
  "prisma.config.ts",
  "src/generated",
  "src/plugins/db-prisma",
];

const MONGOOSE_ARTIFACTS = ["src/plugins/db-mongoose"];

const PRISMA_REPOSITORY_FILES = [
  "src/modules/auth/auth.repository.ts",
  "src/modules/user/user.repository.ts",
  "src/modules/metrics/metrics.repository.ts",
];

function resolveProject(projectRoot, relativePath) {
  return path.join(projectRoot, relativePath);
}

function removeIfExists(projectRoot, relativePath) {
  const fullPath = resolveProject(projectRoot, relativePath);

  if (!fs.existsSync(fullPath)) {
    return;
  }

  fs.rmSync(fullPath, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function applyOverlay(projectRoot, overlayDir) {
  if (!fs.existsSync(overlayDir)) {
    return;
  }

  const walk = (currentSrc, currentDest) => {
    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(currentSrc, entry.name);
      const destPath = path.join(currentDest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        walk(srcPath, destPath);
        continue;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  };

  walk(overlayDir, projectRoot);
}

function writeFile(projectRoot, relativePath, content) {
  const fullPath = resolveProject(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readEnvFile(projectRoot) {
  const envPath = resolveProject(projectRoot, ".env");
  return fs.readFileSync(envPath, "utf-8");
}

function writeEnvFile(projectRoot, content) {
  const envPath = resolveProject(projectRoot, ".env");
  fs.writeFileSync(envPath, content);
}

function upsertEnvValue(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }

  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function removeEnvKey(content, key) {
  return content
    .split("\n")
    .filter((line) => !line.startsWith(`${key}=`))
    .join("\n");
}

function cleanPackageJson(projectRoot, db) {
  const pkgPath = resolveProject(projectRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  const prismaDeps = [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/adapter-better-sqlite3",
    "pg",
    "prisma",
  ];

  const prismaScripts = ["generate", "migrate", "migrate:pg", "migrate:sqlite", "generate:pg", "generate:sqlite", "seed", "studio"];

  if (db === "mongodb") {
    for (const dep of prismaDeps) {
      delete pkg.dependencies?.[dep];
      delete pkg.devDependencies?.[dep];
    }

    for (const script of prismaScripts) {
      delete pkg.scripts?.[script];
    }

    delete pkg.prisma;
  }

  if (db === "postgresql") {
    delete pkg.dependencies?.mongoose;
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

function setupPostgreSQL(projectRoot, assetsDir) {
  for (const artifact of MONGOOSE_ARTIFACTS) {
    removeIfExists(projectRoot, artifact);
  }

  const prismaAssetsDir = path.join(assetsDir, "prisma");
  const schemaSource = path.join(prismaAssetsDir, "schema.postgresql.prisma");
  const schemaTarget = resolveProject(projectRoot, "prisma/schema.prisma");

  fs.mkdirSync(path.dirname(schemaTarget), { recursive: true });
  fs.copyFileSync(schemaSource, schemaTarget);

  const migrationsSource = path.join(prismaAssetsDir, "migrations");
  if (fs.existsSync(migrationsSource)) {
    copyRecursive(
      migrationsSource,
      resolveProject(projectRoot, "prisma/migrations"),
    );
  }

  const seedSource = path.join(prismaAssetsDir, "seed.ts");
  if (fs.existsSync(seedSource)) {
    fs.copyFileSync(seedSource, resolveProject(projectRoot, "prisma/seed.ts"));
  }

  writeFile(
    projectRoot,
    "prisma.config.ts",
    `import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
`,
  );

  const overlayDir = path.join(path.dirname(assetsDir), "overlays", "postgresql");
  applyOverlay(projectRoot, overlayDir);
}

function setupMongoDB(projectRoot) {
  for (const artifact of PRISMA_ARTIFACTS) {
    removeIfExists(projectRoot, artifact);
  }

  for (const file of PRISMA_REPOSITORY_FILES) {
    removeIfExists(projectRoot, file);
  }

  const overlayDir = path.join(__dirname, "..", "overlays", "mongodb");
  applyOverlay(projectRoot, overlayDir);
}

function ensureEnvFile(projectRoot) {
  const envPath = resolveProject(projectRoot, ".env");
  const envExamplePath = resolveProject(projectRoot, ".env.example");

  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  }

  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env and .env.example in generated project");
  }
}

function configureEnvironment(projectRoot, db) {
  ensureEnvFile(projectRoot);
  let envContent = readEnvFile(projectRoot);

  envContent = upsertEnvValue(envContent, "DB_PROVIDER", db);

  if (db === "postgresql") {
    envContent = removeEnvKey(envContent, "MONGO_URI");
    envContent = upsertEnvValue(
      envContent,
      "DATABASE_URL",
      "postgresql://user:password@localhost:5432/db",
    );
  }

  if (db === "mongodb") {
    envContent = removeEnvKey(envContent, "DATABASE_URL");
    envContent = upsertEnvValue(
      envContent,
      "MONGO_URI",
      "mongodb://localhost:27017/db",
    );
  }

  writeEnvFile(projectRoot, envContent);

  const envExamplePath = resolveProject(projectRoot, ".env.example");
  if (fs.existsSync(envExamplePath)) {
    let exampleContent = fs.readFileSync(envExamplePath, "utf-8");
    exampleContent = upsertEnvValue(exampleContent, "DB_PROVIDER", db);

    if (db === "postgresql") {
      exampleContent = removeEnvKey(exampleContent, "MONGO_URI");
      exampleContent = upsertEnvValue(
        exampleContent,
        "DATABASE_URL",
        "postgresql://user:password@localhost:5432/db",
      );
    }

    if (db === "mongodb") {
      exampleContent = removeEnvKey(exampleContent, "DATABASE_URL");
      exampleContent = upsertEnvValue(
        exampleContent,
        "MONGO_URI",
        "mongodb://localhost:27017/db",
      );
    }

    fs.writeFileSync(envExamplePath, exampleContent);
  }
}

function runPrismaGenerate(projectRoot) {
  execSync("npx prisma generate", {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

function composeProject(projectRoot, options) {
  const { db } = options;
  const packageRoot = path.join(__dirname, "..");
  const assetsDir = path.join(packageRoot, "assets");

  if (db === "postgresql") {
    setupPostgreSQL(projectRoot, assetsDir);
  }

  if (db === "mongodb") {
    setupMongoDB(projectRoot);
  }

  configureEnvironment(projectRoot, db);
  cleanPackageJson(projectRoot, db);
}

module.exports = {
  composeProject,
  runPrismaGenerate,
};