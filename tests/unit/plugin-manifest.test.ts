import fs from "fs";
import path from "path";
import {
  findMissingPackages,
  manifest,
  PluginConfigurationError,
  resolvePluginOrder,
} from "@/plugins/manifest";

const repoRoot = path.resolve(__dirname, "..", "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
const rootVersions: Record<string, string> = {
  ...rootPackage.dependencies,
  ...rootPackage.devDependencies,
};

describe("plugin manifest", () => {
  it("lists every plugin after the plugins it requires or optionally uses", () => {
    const order = Object.keys(manifest.plugins);
    for (const [name, entry] of Object.entries(manifest.plugins)) {
      for (const dependency of [...entry.requires, ...entry.optional]) {
        expect(order).toContain(dependency);
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(name));
      }
    }
  });

  it("points every plugin entry at an existing module with a default export", () => {
    for (const [name, entry] of Object.entries(manifest.plugins)) {
      const modulePath = path.join(repoRoot, "src/plugins", `${entry.entry}.ts`);
      expect({ name, exists: fs.existsSync(modulePath) }).toEqual({ name, exists: true });
      expect(fs.readFileSync(modulePath, "utf-8")).toMatch(/export default/);
      for (const file of entry.files) {
        expect({ name, file, exists: fs.existsSync(path.join(repoRoot, file)) }).toEqual({ name, file, exists: true });
      }
    }
  });

  it("uses the same package versions the framework is developed and tested with", () => {
    const sections = [
      manifest.core.dependencies,
      manifest.core.devDependencies,
      ...Object.values(manifest.databases).flatMap((db) => [db.dependencies, db.devDependencies]),
      ...Object.values(manifest.plugins).map((plugin) => plugin.dependencies),
    ];
    for (const section of sections) {
      for (const [pkg, version] of Object.entries(section)) {
        expect({ pkg, version: rootVersions[pkg] }).toEqual({ pkg, version });
      }
    }
  });

  it("declares every npm package imported by an optional plugin's files", () => {
    const declaredByPlugin = (name: string): string[] => {
      const entry = manifest.plugins[name];
      return [
        ...Object.keys(entry.dependencies),
        ...entry.requires.flatMap((dependency) => declaredByPlugin(dependency)),
      ];
    };
    const always = new Set([
      ...Object.keys(manifest.core.dependencies),
      ...Object.keys(manifest.core.devDependencies),
      "fastify",
      "crypto",
      "node:crypto",
      "fs",
      "path",
      "stream",
    ]);

    for (const [name, entry] of Object.entries(manifest.plugins)) {
      const allowed = new Set([...always, ...declaredByPlugin(name)]);
      for (const dir of entry.files) {
        const files = listTs(path.join(repoRoot, dir));
        for (const file of files) {
          for (const pkg of bareImports(fs.readFileSync(file, "utf-8"))) {
            expect({ plugin: name, file: path.relative(repoRoot, file), pkg, declared: allowed.has(pkg) }).toEqual({
              plugin: name,
              file: path.relative(repoRoot, file),
              pkg,
              declared: true,
            });
          }
        }
      }
    }
  });
});

describe("resolvePluginOrder", () => {
  it("returns plugins in dependency order", () => {
    expect(resolvePluginOrder(["events", "queue", "redis", "geo", "cache"])).toEqual([
      "redis",
      "cache",
      "queue",
      "events",
      "geo",
    ]);
  });

  it("returns an empty list for no plugins", () => {
    expect(resolvePluginOrder([])).toEqual([]);
  });

  it("rejects unknown plugin names", () => {
    expect(() => resolvePluginOrder(["socket"])).toThrow(PluginConfigurationError);
    expect(() => resolvePluginOrder(["socket"])).toThrow(/Unknown plugin\(s\) in PLUGINS: socket/);
  });

  it("rejects missing required plugins instead of warning", () => {
    expect(() => resolvePluginOrder(["cache"])).toThrow(/"cache" requires "redis"/);
    expect(() => resolvePluginOrder(["redis", "events"])).toThrow(/"events" requires "queue"/);
  });

  it("refuses experimental plugins in production", () => {
    const plugins = {
      lab: { ...manifest.plugins.redis, stability: "experimental" as const, requires: [] },
    };
    expect(resolvePluginOrder(["lab"], { plugins, nodeEnv: "development" })).toEqual(["lab"]);
    expect(() => resolvePluginOrder(["lab"], { plugins, nodeEnv: "production" })).toThrow(/experimental/);
  });
});

describe("findMissingPackages", () => {
  it("reports packages that cannot be resolved", () => {
    const resolve = (pkg: string) => {
      if (pkg === "axios") throw new Error("not found");
      return pkg;
    };
    expect(findMissingPackages(manifest.plugins.geo, resolve)).toEqual(["axios"]);
  });
});

function listTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) return dir.endsWith(".ts") ? [dir] : [];
  return fs.readdirSync(dir).flatMap((entry) => listTs(path.join(dir, entry)));
}

function bareImports(source: string): string[] {
  const packages = new Set<string>();
  const pattern = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("@/")) continue;
    const parts = specifier.split("/");
    packages.add(specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]);
  }
  return [...packages];
}
