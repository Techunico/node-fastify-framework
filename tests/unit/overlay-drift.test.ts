import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "..", "..");
const overlaysRoot = path.join(repoRoot, "packages/create-techunico-app/overlays");

/**
 * The only files a database overlay may contain. Anything else means
 * database-agnostic code is being forked per database — put it in src/.
 */
const APPROVED_OVERLAY_FILES: Record<string, string[]> = {
  mongodb: [
    "scripts/seed.ts",
    "src/models/rbac.model.ts",
    "src/modules/user/user.repository.ts",
    "src/plugins/database.ts",
  ],
};

function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|let|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(match[1]);
  }
  if (/export\s+default\b/.test(source)) names.add("default");
  return [...names].sort();
}

describe("database overlays", () => {
  it("contain only approved database-specific files", () => {
    const databases = fs.existsSync(overlaysRoot) ? fs.readdirSync(overlaysRoot) : [];
    for (const db of databases) {
      expect({ db, files: listFiles(path.join(overlaysRoot, db)).sort() }).toEqual({
        db,
        files: (APPROVED_OVERLAY_FILES[db] ?? []).slice().sort(),
      });
    }
  });

  it("export the same names as the framework file they replace", () => {
    for (const [db, files] of Object.entries(APPROVED_OVERLAY_FILES)) {
      for (const file of files) {
        const original = path.join(repoRoot, file);
        if (!fs.existsSync(original)) continue; // overlay-only file (models, seed)
        const overlay = fs.readFileSync(path.join(overlaysRoot, db, file), "utf-8");
        expect({ db, file, exports: exportedNames(overlay) }).toEqual({
          db,
          file,
          exports: exportedNames(fs.readFileSync(original, "utf-8")),
        });
      }
    }
  });
});
