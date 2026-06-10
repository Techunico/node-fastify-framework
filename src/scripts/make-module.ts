import * as fs from "fs";
import * as path from "path";

const moduleName = process.argv[2];

if (!moduleName) {
  console.error("❌ Please provide module name");
  process.exit(1);
}

const modulePath = path.join(process.cwd(), "src/modules", moduleName);

if (fs.existsSync(modulePath)) {
  console.error("❌ Module already exists");
  process.exit(1);
}

fs.mkdirSync(modulePath, { recursive: true });

// 🔍 Detect DB
const envPath = path.join(process.cwd(), ".env");
let dbProvider = "postgresql";

if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  if (env.includes("DB_PROVIDER=mongodb")) {
    dbProvider = "mongodb";
  }
}

// 🔤 Name helpers
const pascalName =
  moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

const camelName =
  moduleName.charAt(0).toLowerCase() + moduleName.slice(1);

const templateDir = path.join(process.cwd(), "src/scripts/templates/module");
const files = fs.readdirSync(templateDir);

files.forEach((file) => {
  // skip based on DB
  if (dbProvider === "mongodb" && file.includes("repository")) return;
  if (dbProvider === "postgresql" && file.includes("model")) return;

  let content = fs.readFileSync(path.join(templateDir, file), "utf-8");

  content = content
    .replace(/{{name}}/g, moduleName)
    .replace(/{{pascalName}}/g, pascalName)
    .replace(/{{camelName}}/g, camelName);

  const baseName = file.replace(".txt", "");

  const fileName =
    baseName !== "index.ts" ? `${moduleName}.${baseName}` : baseName;

  fs.writeFileSync(path.join(modulePath, fileName), content);
});

console.log(`✅ Module "${moduleName}" created successfully`);