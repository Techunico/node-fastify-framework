#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const inquirer = require("inquirer");

const args = process.argv.slice(2);

if (!args.length || !args[0].trim()) {
  console.error("❌ Please provide project name");
  process.exit(1);
}

const projectName = args[0];
const targetPath = path.join(process.cwd(), projectName);
const templatePath = path.join(__dirname, "template");

if (!fs.existsSync(templatePath)) {
  console.error("❌ Template missing");
  process.exit(1);
}

if (fs.existsSync(targetPath)) {
  console.error("❌ Folder already exists");
  process.exit(1);
}

async function run() {
  // 🧠 Ask user choices
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "db",
      message: "Select database:",
      choices: [
        { name: "PostgreSQL (Prisma)", value: "postgresql" },
        { name: "MongoDB (Mongoose)", value: "mongodb" },
      ],
    },
    {
      type: "checkbox",
      name: "plugins",
      message: "Select optional plugins:",
      choices: [
        { name: "Redis", value: "redis" },
        { name: "Queue (BullMQ)", value: "queue" },
        { name: "WebSockets (Socket.io)", value: "socket" },
      ],
    },
    {
      type: "list",
      name: "pkgManager",
      message: "Select package manager:",
      choices: ["npm", "yarn", "pnpm"],
    },
  ]);

  const { db, pkgManager, plugins } = answers;

  // 📁 Copy template
  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(templatePath, targetPath, { recursive: true, force: true });

  // ========================
  // 📦 PACKAGE.JSON SETUP
  // ========================

  const pkgPath = path.join(targetPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  pkg.name = projectName;

  // ✅ Base deps
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
  };

  pkg.devDependencies = {
    typescript: "^6.0.2",
    "ts-node-dev": "^2.0.0",
    "@types/node": "^25.6.0",
  };

  // ========================
  // 🧠 DB
  // ========================

  if (db === "postgresql") {
    Object.assign(pkg.dependencies, {
      "@prisma/client": "^7.7.0",
      "@prisma/adapter-pg": "^7.7.0",
      pg: "^8.20.0",
    });

    Object.assign(pkg.devDependencies, {
      prisma: "^7.7.0",
    });

    pkg.scripts["generate"] = "prisma generate";
    pkg.scripts["migrate"] = "prisma migrate dev";
  }

  if (db === "mongodb") {
    pkg.dependencies["mongoose"] = "^8.5.0";
  }

  // ========================
  // 🔌 Plugins
  // ========================

  if (plugins.includes("redis")) {
    pkg.dependencies["ioredis"] = "^5.10.1";
  }

  if (plugins.includes("queue")) {
    pkg.dependencies["bullmq"] = "^5.74.1";
  }

  if (plugins.includes("socket")) {
    pkg.dependencies["socket.io"] = "^4.8.3";
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // ========================
  // 🌍 ENV SETUP
  // ========================

  const envExamplePath = path.join(targetPath, ".env.example");
  const envPath = path.join(targetPath, ".env");

  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  }

  let envContent = fs.readFileSync(envPath, "utf-8");

  envContent = envContent.replace("DB_PROVIDER=", `DB_PROVIDER=${db}`);

  if (db === "postgresql") {
    envContent = envContent.replace(
      "DATABASE_URL=",
      "DATABASE_URL=postgresql://user:password@localhost:5432/db"
    );
  }

  if (db === "mongodb") {
    envContent = envContent.replace(
      "MONGO_URI=",
      "MONGO_URI=mongodb://localhost:27017/db"
    );
  }

  envContent = envContent.replace(
    "PLUGINS=",
    `PLUGINS=${plugins.join(",")}`
  );

  fs.writeFileSync(envPath, envContent);

  console.log(`\n✅ Project ${projectName} created`);

  // ========================
  // 📦 INSTALL
  // ========================

  console.log(`\n📦 Installing dependencies using ${pkgManager}...\n`);

  const installCmd =
    pkgManager === "npm"
      ? "npm install"
      : pkgManager === "yarn"
      ? "yarn"
      : "pnpm install";

  execSync(installCmd, {
    cwd: targetPath,
    stdio: "inherit",
  });

  // ========================
  // 🚀 NEXT STEPS
  // ========================

  console.log(`
🚀 Next steps:

cd ${projectName}
`);

  if (db === "postgresql") {
    console.log(`npx prisma generate`);
  }

  console.log(`${pkgManager === "npm" ? "npm run dev" : pkgManager + " dev"}`);
}

run();