#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const inquirer = require("inquirer");
const { composeProject, runPrismaGenerate } = require("./lib/compose");

const args = process.argv.slice(2);

if (!args.length || !args[0].trim()) {
  console.error("❌ Please provide project name");
  process.exit(1);
}

const projectName = args[0];
const targetPath = path.join(process.cwd(), projectName);
const templatePath = path.join(__dirname, "template");

if (!fs.existsSync(templatePath)) {
  console.error("❌ Template missing. Run `npm run build:template` in the framework repo.");
  process.exit(1);
}

if (fs.existsSync(targetPath)) {
  console.error("❌ Folder already exists");
  process.exit(1);
}

async function run() {
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

  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(templatePath, targetPath, { recursive: true, force: true });

  const pkgPath = path.join(targetPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  pkg.name = projectName;

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
  };

  if (db === "postgresql") {
    Object.assign(pkg.dependencies, {
      "@prisma/client": "^7.7.0",
      "@prisma/adapter-pg": "^7.7.0",
      pg: "^8.20.0",
    });

    Object.assign(pkg.devDependencies, {
      prisma: "^7.7.0",
      "ts-node": "^10.9.2",
      "@types/pg": "^8.20.0",
    });

    pkg.scripts.generate = "prisma generate";
    pkg.scripts.migrate = "prisma migrate dev";
    pkg.scripts.seed = "ts-node prisma/seed.ts";
    pkg.prisma = {
      seed: "ts-node prisma/seed.ts",
    };
  }

  if (db === "mongodb") {
    pkg.dependencies.mongoose = "^8.5.0";
    pkg.devDependencies["ts-node"] = "^10.9.2";
    pkg.scripts.seed = "ts-node scripts/seed.ts";
  }

  if (plugins.includes("redis")) {
    pkg.dependencies.ioredis = "^5.10.1";
  }

  if (plugins.includes("queue")) {
    pkg.dependencies.bullmq = "^5.74.1";
  }

  if (plugins.includes("socket")) {
    pkg.dependencies["socket.io"] = "^4.8.3";
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  composeProject(targetPath, { db, plugins });

  const envPath = path.join(targetPath, ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");

  if (plugins.length > 0) {
    envContent = envContent.replace(/^PLUGINS=.*$/m, `PLUGINS=${plugins.join(",")}`);
  } else {
    envContent = envContent.replace(/^PLUGINS=.*$/m, "PLUGINS=");
  }

  fs.writeFileSync(envPath, envContent);

  console.log(`\n✅ Project ${projectName} created`);

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

  if (db === "postgresql") {
    console.log("\n🔧 Generating Prisma client...\n");
    runPrismaGenerate(targetPath);
  }

  const devCmd =
    pkgManager === "npm" ? "npm run dev" : `${pkgManager} dev`;

  console.log(`
🚀 Next steps:

cd ${projectName}
`);

  if (db === "postgresql") {
    console.log(`${pkgManager === "npm" ? "npm run migrate" : pkgManager + " migrate"}   # after database is running`);
    console.log(`${pkgManager === "npm" ? "npm run seed" : pkgManager + " seed"}       # optional`);
  }

  if (db === "mongodb") {
    console.log(`${pkgManager === "npm" ? "npm run seed" : pkgManager + " seed"}       # after MongoDB is running`);
  }

  console.log(devCmd);
}

run();