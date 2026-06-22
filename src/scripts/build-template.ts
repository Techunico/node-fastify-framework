import fs from "fs";
import path from "path";

const root = process.cwd();

const templateRoot = path.join(root, "template");
const cliTemplate = path.join(root, "packages/create-techunico-app/template");

// helper
const resolve = (...p: string[]) => path.join(root, ...p);

// clean
fs.rmSync(templateRoot, { recursive: true, force: true });
fs.rmSync(cliTemplate, { recursive: true, force: true });

// ensure dirs
fs.mkdirSync(templateRoot, { recursive: true });

// helper copy
const copy = (src: string, dest: string) => {
  const srcPath = resolve(src);
  if (!fs.existsSync(srcPath)) return;
  fs.cpSync(srcPath, dest, { recursive: true });
};

// ========================
// 📦 COPY CORE FILES
// ========================

copy("src", path.join(templateRoot, "src"));
copy("tsconfig.json", path.join(templateRoot, "tsconfig.json"));
copy(".env.example", path.join(templateRoot, ".env.example"));
copy(".gitignore", path.join(templateRoot, ".gitignore"));

// ========================
// 🧹 CLEANUP
// ========================

// Remove generated prisma artifacts if present
const prismaGeneratedPath = path.join(templateRoot, "src/generated");

if (fs.existsSync(prismaGeneratedPath)) {
  fs.rmSync(prismaGeneratedPath, { recursive: true, force: true });
}

// ========================
// 📦 SANITIZE package.json
// ========================

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

// write cleaned package.json
fs.writeFileSync(
  path.join(templateRoot, "package.json"),
  JSON.stringify(templatePkg, null, 2),
);

// ========================
// 📄 README
// ========================

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

// ========================
// 📦 COPY TO CLI
// ========================

fs.mkdirSync(cliTemplate, { recursive: true });
fs.cpSync(templateRoot, cliTemplate, { recursive: true });

// cleanup temp template
fs.rmSync(templateRoot, { recursive: true, force: true });

console.log("✅ Template built & synced to CLI");