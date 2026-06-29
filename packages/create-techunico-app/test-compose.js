const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { composeProject, runPrismaGenerate } = require("./lib/compose");

const packageRoot = __dirname;
const templatePath = path.join(packageRoot, "template");
const testRoot = path.join(packageRoot, ".test-output");

function setupPackage(targetPath, db) {
  const pkg = JSON.parse(fs.readFileSync(path.join(targetPath, "package.json"), "utf-8"));

  pkg.dependencies = {
    fastify: "^5.8.5",
    "fastify-plugin": "^5.1.0",
    dotenv: "^17.4.2",
    pino: "^10.3.1",
    "pino-pretty": "^13.1.3",
    zod: "^4.3.6",
    jsonwebtoken: "^9.0.3",
    "prom-client": "^15.1.3",
    "tsconfig-paths": "^4.2.0",
    bcrypt: "^6.0.0",
  };

  pkg.devDependencies = {
    typescript: "^6.0.2",
    "ts-node-dev": "^2.0.0",
    "@types/node": "^25.6.0",
    "@types/bcrypt": "^6.0.0",
    "ts-node": "^10.9.2",
  };

  if (db === "postgresql") {
    Object.assign(pkg.dependencies, {
      "@prisma/client": "^7.7.0",
      "@prisma/adapter-pg": "^7.7.0",
      pg: "^8.20.0",
    });
    pkg.devDependencies.prisma = "^7.7.0";
    pkg.devDependencies["@types/pg"] = "^8.20.0";
    pkg.scripts.generate = "prisma generate";
    pkg.scripts.migrate = "prisma migrate dev";
    pkg.scripts.seed = "ts-node prisma/seed.ts";
  }

  if (db === "mongodb") {
    pkg.dependencies.mongoose = "^8.5.0";
    pkg.scripts.seed = "ts-node scripts/seed.ts";
  }

  fs.writeFileSync(path.join(targetPath, "package.json"), JSON.stringify(pkg, null, 2));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMissing(targetPath, relativePath) {
  assert(
    !fs.existsSync(path.join(targetPath, relativePath)),
    `Expected missing: ${relativePath}`,
  );
}

function assertExists(targetPath, relativePath) {
  assert(
    fs.existsSync(path.join(targetPath, relativePath)),
    `Expected present: ${relativePath}`,
  );
}

function createProject(name, db) {
  const targetPath = path.join(testRoot, name);

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(templatePath, targetPath, { recursive: true });

  setupPackage(targetPath, db);
  composeProject(targetPath, { db, plugins: [] });
  verifyTemplateHasNoGeneratedClient(targetPath);

  const envPath = path.join(targetPath, ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  envContent = envContent.replace(/^PLUGINS=.*$/m, "PLUGINS=");
  fs.writeFileSync(envPath, envContent);

  execSync("npm install", { cwd: targetPath, stdio: "inherit" });

  if (db === "postgresql") {
    runPrismaGenerate(targetPath);
  }

  return targetPath;
}

function verifyMongoProject(targetPath) {
  assertMissing(targetPath, "prisma");
  assertMissing(targetPath, "prisma.config.ts");
  assertMissing(targetPath, "src/generated");
  assertMissing(targetPath, "src/plugins/db-prisma");
  assertExists(targetPath, "src/plugins/db-mongoose");
  assertExists(targetPath, "src/models/rbac.model.ts");
  assertExists(targetPath, "scripts/seed.ts");

  const pkg = JSON.parse(fs.readFileSync(path.join(targetPath, "package.json"), "utf-8"));
  assert(!pkg.dependencies["@prisma/client"], "Prisma dependency should be removed");
  assert(!pkg.dependencies.prisma, "Prisma CLI dependency should be removed");
  assert(!pkg.prisma, "Prisma package config should be removed");
  assert(pkg.dependencies.mongoose, "Mongoose dependency should exist");
}

function verifyPostgresProject(targetPath) {
  assertExists(targetPath, "prisma/schema.prisma");
  assertExists(targetPath, "prisma/seed.ts");
  assertExists(targetPath, "prisma.config.ts");
  assertExists(targetPath, "src/generated/prisma");
  assertExists(targetPath, "src/plugins/db-prisma");
  assertMissing(targetPath, "src/plugins/db-mongoose");
  assertMissing(targetPath, "prisma/migrations");

  const config = fs.readFileSync(
    path.join(targetPath, "prisma.config.ts"),
    "utf-8",
  );
  assert(
    config.includes('schema: "prisma/schema.prisma"'),
    "prisma.config.ts should reference prisma/schema.prisma",
  );

  const pkg = JSON.parse(fs.readFileSync(path.join(targetPath, "package.json"), "utf-8"));
  assert(pkg.dependencies["@prisma/client"], "Prisma dependency should exist");
  assert(!pkg.dependencies.mongoose, "Mongoose dependency should be removed");
}

function verifyTemplateHasNoGeneratedClient(targetPath) {
  assertMissing(targetPath, "src/generated/prisma");
}

function typecheckProject(targetPath) {
  const tsconfigPath = path.join(targetPath, "tsconfig.json");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
  tsconfig.compilerOptions.types = ["node"];
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  execSync("npx tsc --noEmit", {
    cwd: targetPath,
    stdio: "inherit",
  });
}

fs.rmSync(testRoot, { recursive: true, force: true });
fs.mkdirSync(testRoot, { recursive: true });

console.log("Testing MongoDB composition...");
const mongoPath = createProject("mongo-app", "mongodb");
verifyMongoProject(mongoPath);
typecheckProject(mongoPath);
console.log("✅ MongoDB composition checks passed");

console.log("Testing PostgreSQL composition...");
const pgPath = createProject("pg-app", "postgresql");
verifyPostgresProject(pgPath);
typecheckProject(pgPath);
console.log("✅ PostgreSQL composition checks passed");