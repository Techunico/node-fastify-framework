import fs from "fs";
import path from "path";

const root = process.cwd();

const templateRoot = path.join(root, "template");
const cliTemplate = path.join(root, "packages/create-techunico-app/template");
const cliAssetsPrisma = path.join(
  root,
  "packages/create-techunico-app/assets/prisma",
);

const resolve = (...p: string[]) => path.join(root, ...p);

fs.rmSync(templateRoot, { recursive: true, force: true });
fs.rmSync(cliTemplate, { recursive: true, force: true });

fs.mkdirSync(templateRoot, { recursive: true });

const copy = (src: string, dest: string) => {
  const srcPath = resolve(src);
  if (!fs.existsSync(srcPath)) return;
  fs.cpSync(srcPath, dest, { recursive: true });
};

copy("src", path.join(templateRoot, "src"));

const excludedTemplatePaths = [
  path.join(templateRoot, "src/scripts/build-template.ts"),
  path.join(templateRoot, "src/scripts/add-plugin.ts"),
];

for (const excludedPath of excludedTemplatePaths) {
  if (fs.existsSync(excludedPath)) {
    fs.rmSync(excludedPath, { force: true });
  }
}
copy("tsconfig.json", path.join(templateRoot, "tsconfig.json"));
copy(".env.example", path.join(templateRoot, ".env.example"));
copy(".gitignore", path.join(templateRoot, ".gitignore"));

const prismaGeneratedPath = path.join(templateRoot, "src/generated");

if (fs.existsSync(prismaGeneratedPath)) {
  fs.rmSync(prismaGeneratedPath, { recursive: true, force: true });
}

const rootPkg = JSON.parse(fs.readFileSync(resolve("package.json"), "utf-8"));

const baseScripts = [
  "dev",
  "build",
  "start",
  "test",
  "make:module",
  "plugin:add",
];

const filteredScripts: Record<string, string> = {};

for (const key of baseScripts) {
  if (rootPkg.scripts?.[key]) {
    filteredScripts[key] = rootPkg.scripts[key];
  }
}

const templatePkg = {
  name: "my-app",
  version: "1.0.0",
  private: true,
  scripts: filteredScripts,
  dependencies: {},
  devDependencies: {},
};

fs.writeFileSync(
  path.join(templateRoot, "package.json"),
  JSON.stringify(templatePkg, null, 2),
);

const templateReadme = `
# 🚀 Techunico App

This project was generated using:

npx @techunico/node-framework

---

# ⚡ Quick Start

## 1. Setup environment

\`\`\`bash
cp .env.example .env
\`\`\`

---

## 2. Install dependencies

\`\`\`bash
npm install
\`\`\`

---

## 3. Run the app

\`\`\`bash
npm run dev
\`\`\`

---

# 📡 API

Base URL:

\`\`\`
/api/v1
\`\`\`

---

# ❤️ Health & Metrics

\`\`\`
GET /health
GET /ready
GET /metrics
\`\`\`

---

# 🧱 Structure

\`\`\`
src/
├── modules/
├── plugins/
├── core/
├── config/
\`\`\`

---

# 🔐 Auth

\`\`\`
POST /api/v1/auth/register
POST /api/v1/auth/login
\`\`\`

---

# 🧠 Notes

Database support:
- PostgreSQL (Prisma plugin)
- MongoDB (Mongoose plugin)

- Uses Zod for validation
- Includes RBAC system

---

# 👨‍💻 Techunico

Built with ❤️ by Techunico
`;

fs.writeFileSync(path.join(templateRoot, "README.md"), templateReadme.trim());

fs.mkdirSync(cliTemplate, { recursive: true });
fs.cpSync(templateRoot, cliTemplate, { recursive: true });

if (fs.existsSync(resolve("prisma/schema.postgresql.prisma"))) {
  fs.mkdirSync(cliAssetsPrisma, { recursive: true });
  fs.copyFileSync(
    resolve("prisma/schema.postgresql.prisma"),
    path.join(cliAssetsPrisma, "schema.postgresql.prisma"),
  );
}

fs.rmSync(templateRoot, { recursive: true, force: true });

console.log("✅ Template built & synced to CLI");