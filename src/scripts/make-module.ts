/**
 * npm run make:module <name>
 *
 * Creates src/modules/<name>/ with routes, controller, service, schema,
 * repository contract and a repository for this application's database.
 * PostgreSQL apps also get a Prisma model appended to prisma/schema.prisma;
 * MongoDB apps get a registered Mongoose model.
 */
import * as fs from "fs";
import * as path from "path";
import { toCamelCase, toPascalCase } from "../utils/string/case";

const RESERVED = new Set(["auth", "user", "health", "metrics", "core", "plugins", "config"]);

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const name = process.argv[2];
if (!name) fail("Please provide a module name, e.g. npm run make:module order-items");
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  fail(`Invalid module name "${name}": use lowercase kebab-case (e.g. "invoice" or "order-items")`);
}
if (RESERVED.has(name)) fail(`"${name}" is reserved`);

const root = process.cwd();
const modulePath = path.join(root, "src/modules", name);
if (fs.existsSync(modulePath)) fail(`Module "${name}" already exists`);

// The database binding (src/plugins/database.ts) is authoritative, not .env.
const binding = fs.readFileSync(path.join(root, "src/plugins/database.ts"), "utf-8");
const db = /databaseProvider\s*=\s*"mongodb"/.test(binding) ? "mongodb" : "postgresql";

const vars = { name, camelName: toCamelCase(name), pascalName: toPascalCase(name) };
const render = (file: string) =>
  fs
    .readFileSync(path.join(root, "src/scripts/templates/module", file), "utf-8")
    .replace(/{{name}}/g, vars.name)
    .replace(/{{camelName}}/g, vars.camelName)
    .replace(/{{pascalName}}/g, vars.pascalName);

const files: Record<string, string> = {
  "index.ts": "index.ts.txt",
  [`${name}.routes.ts`]: "routes.ts.txt",
  [`${name}.controller.ts`]: "controller.ts.txt",
  [`${name}.service.ts`]: "service.ts.txt",
  [`${name}.schema.ts`]: "schema.ts.txt",
  [`${name}.types.ts`]: "types.ts.txt",
  [`${name}.repository.ts`]: `repository.${db}.ts.txt`,
  ...(db === "mongodb" ? { [`${name}.model.ts`]: "model.mongodb.ts.txt" } : {}),
};

fs.mkdirSync(modulePath, { recursive: true });
for (const [target, template] of Object.entries(files)) {
  fs.writeFileSync(path.join(modulePath, target), render(template));
}

const nextSteps: string[] = [];
if (db === "postgresql") {
  const schemaPath = path.join(root, "prisma/schema.prisma");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  if (new RegExp(`^model\\s+${vars.pascalName}\\s*\\{`, "m").test(schema)) {
    nextSteps.push(`prisma/schema.prisma already has model ${vars.pascalName}; make sure it has name and createdAt fields`);
  } else {
    fs.appendFileSync(schemaPath, render("prisma-model.postgresql.txt"));
    nextSteps.push(`Added model ${vars.pascalName} to prisma/schema.prisma`);
  }
  nextSteps.push("Run: npm run generate && npm run migrate");
}

console.log(`✅ Module "${name}" created in src/modules/${name} (${db})`);
console.log(`   Routes: GET/POST <API_PREFIX>/<API_VERSION>/${name}`);
for (const step of nextSteps) console.log(`   ${step}`);
