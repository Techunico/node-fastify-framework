/**
 * Builds packages/create-techunico-app/template from the framework source.
 *
 *   src/ (minus tooling, experimental code, generated client)  → template/src
 *   tsconfig.json, .env.example                                 → template/
 *   packages/create-techunico-app/scaffold/*                    → template/  (app-owned files)
 *   prisma/{schema.postgresql.prisma,seed.ts,starter/…}         → assets/prisma
 *
 * Paths are resolved from this file, so the script works from any cwd.
 */
import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "..", "..");
const cliRoot = path.join(repoRoot, "packages/create-techunico-app");
const templateRoot = path.join(cliRoot, "template");
const scaffoldRoot = path.join(cliRoot, "scaffold");
const assetsPrisma = path.join(cliRoot, "assets/prisma");

/** Paths under src/ that never ship to applications. */
export const EXCLUDED_SOURCE_PATHS = [
  "scripts/build-template.ts",
  "scripts/add-plugin.ts",
  "experimental",
  "generated",
];

const EXCLUDED_FILE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

const fromRepo = (...segments: string[]) => path.join(repoRoot, ...segments);

function copySource() {
  const sourceRoot = fromRepo("src");
  const excluded = EXCLUDED_SOURCE_PATHS.map((p) => path.join(sourceRoot, p));

  fs.cpSync(sourceRoot, path.join(templateRoot, "src"), {
    recursive: true,
    filter: (source) =>
      !EXCLUDED_FILE_NAMES.has(path.basename(source)) &&
      !excluded.some((p) => source === p || source.startsWith(p + path.sep)),
  });
}

function copyFile(source: string, destination: string) {
  if (!fs.existsSync(source)) {
    throw new Error(`build-template: missing ${path.relative(repoRoot, source)}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function syncPrismaAssets() {
  fs.rmSync(assetsPrisma, { recursive: true, force: true });
  fs.mkdirSync(assetsPrisma, { recursive: true });

  copyFile(fromRepo("prisma/schema.postgresql.prisma"), path.join(assetsPrisma, "schema.postgresql.prisma"));
  copyFile(fromRepo("prisma/seed.ts"), path.join(assetsPrisma, "seed.ts"));
  copyFile(fromRepo("prisma/starter/prisma.config.ts"), path.join(assetsPrisma, "prisma.config.ts.template"));
}

function main() {
  fs.rmSync(templateRoot, { recursive: true, force: true });
  fs.mkdirSync(templateRoot, { recursive: true });

  copySource();
  copyFile(fromRepo("tsconfig.json"), path.join(templateRoot, "tsconfig.json"));
  copyFile(fromRepo(".env.example"), path.join(templateRoot, ".env.example"));

  for (const entry of fs.readdirSync(scaffoldRoot)) {
    fs.cpSync(path.join(scaffoldRoot, entry), path.join(templateRoot, entry), { recursive: true });
  }

  syncPrismaAssets();

  console.log(`✅ Template built: ${path.relative(repoRoot, templateRoot)}`);
}

main();
