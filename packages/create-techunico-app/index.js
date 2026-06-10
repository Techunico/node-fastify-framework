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
      type: "list",
      name: "pkgManager",
      message: "Select package manager:",
      choices: ["npm", "yarn", "pnpm"],
    },
  ]);

  const { db, pkgManager } = answers;

  // 📁 Copy template
  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(templatePath, targetPath, { recursive: true, force: true });

  // 🔧 Update package.json
  const pkgPath = path.join(targetPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  pkg.name = projectName;

  // 🔥 Inject DB-specific dependencies
  if (db === "postgresql") {
    pkg.dependencies["@prisma/client"] = "^7.7.0";
    pkg.dependencies["@prisma/adapter-pg"] = "^7.7.0";
    pkg.dependencies["pg"] = "^8.20.0";

    pkg.devDependencies["prisma"] = "^7.7.0";

    pkg.scripts["migrate"] = "prisma migrate dev";
    pkg.scripts["generate"] = "prisma generate";
  }

  if (db === "mongodb") {
    pkg.dependencies["mongoose"] = "^8.5.0";
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  console.log(`\n✅ Project ${projectName} created`);

  // 📦 Install deps
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

  // 🚀 Next steps
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