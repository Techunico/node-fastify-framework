import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const repoRoot = path.resolve(__dirname, "..", "..");
const cliRoot = path.join(repoRoot, "packages/create-techunico-app");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compose = require(path.join(cliRoot, "lib/compose.js"));

let workDir: string;

beforeAll(() => {
  execFileSync(process.execPath, ["-r", "ts-node/register/transpile-only", "src/scripts/build-template.ts"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "techunico-cli-test-"));
}, 120_000);

afterAll(() => {
  if (workDir?.startsWith(os.tmpdir())) fs.rmSync(workDir, { recursive: true, force: true });
});

function generate(name: string, db: string, plugins: string[]) {
  return compose.generateProject({ target: path.join(workDir, name), name, db, plugins });
}

function readEnv(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(dir, ".env"), "utf-8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

describe("project name validation", () => {
  it.each(["../escape", "/abs/path", "a/b", "a\\b", "..", ".", "My App", "UPPER", "-flag", "", "node_modules"])(
    "rejects %p",
    (name) => {
      expect(() => compose.resolveTarget(workDir, name)).toThrow(compose.GenerationError);
    },
  );

  it("accepts npm-style names and keeps the target inside cwd", () => {
    expect(compose.resolveTarget(workDir, "my-api.v2")).toBe(path.join(workDir, "my-api.v2"));
  });
});

describe("generated project", () => {
  it("PostgreSQL without plugins contains no optional plugin files or packages", () => {
    const { target, packageJson } = generate("pg-none", "postgresql", []);

    for (const plugin of ["redis", "cache", "queue", "events", "geo", "cloudinary", "payment"]) {
      expect(fs.existsSync(path.join(target, "src/plugins", plugin))).toBe(false);
    }
    expect(fs.existsSync(path.join(target, "src/plugins/db-mongoose"))).toBe(false);
    expect(fs.existsSync(path.join(target, "src/experimental"))).toBe(false);
    expect(fs.existsSync(path.join(target, "src/scripts/build-template.ts"))).toBe(false);

    const deps = Object.keys(packageJson.dependencies);
    for (const pkg of ["ioredis", "bullmq", "axios", "geolib", "cloudinary", "razorpay", "mongoose", "socket.io", "inquirer"]) {
      expect(deps).not.toContain(pkg);
    }
    expect(deps).toEqual(expect.arrayContaining(["fastify", "@prisma/client", "pg"]));
    expect(packageJson.engines.node).toBe(">=20.0.0");
    expect(packageJson.scripts["plugin:add"]).toBeUndefined();
  });

  it("MongoDB with all plugins gets exactly the needed packages and bindings", () => {
    const { target, packageJson, plugins } = generate("mongo-all", "mongodb", ["events", "geo", "cloudinary", "payment", "cache"]);

    expect(plugins).toEqual(["redis", "cache", "queue", "events", "geo", "cloudinary", "payment"]);
    expect(fs.readFileSync(path.join(target, "src/plugins/database.ts"), "utf-8")).toContain("db-mongoose");
    expect(fs.existsSync(path.join(target, "src/plugins/db-prisma"))).toBe(false);
    expect(fs.existsSync(path.join(target, "prisma"))).toBe(false);

    const deps = packageJson.dependencies;
    expect(Object.keys(deps)).toEqual(
      expect.arrayContaining(["mongoose", "ioredis", "bullmq", "axios", "geolib", "cloudinary", "razorpay"]),
    );
    expect(deps["@prisma/client"]).toBeUndefined();
    expect(readEnv(target).PLUGINS).toBe(plugins.join(","));
  });

  it("ships a .gitignore that excludes secrets and build output, without repo rules", () => {
    const { target } = generate("ignore-check", "postgresql", []);
    const gitignore = fs.readFileSync(path.join(target, ".gitignore"), "utf-8");

    for (const rule of [".env", "node_modules/", "dist/", "src/generated/"]) {
      expect(gitignore.split("\n")).toContain(rule);
    }
    expect(gitignore).not.toContain("packages/create-techunico-app");
    expect(fs.existsSync(path.join(target, "_gitignore"))).toBe(false);
  });

  it("writes unique, strong JWT secrets to .env and none to .env.example", () => {
    const a = readEnv(generate("secret-a", "postgresql", []).target);
    const b = readEnv(generate("secret-b", "mongodb", []).target);

    for (const env of [a, b]) {
      expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(64);
      expect(env.JWT_ADMIN_SECRET.length).toBeGreaterThanOrEqual(64);
      expect(env.JWT_SECRET).not.toBe(env.JWT_ADMIN_SECRET);
    }
    expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET);

    const example = fs.readFileSync(path.join(workDir, "secret-a", ".env.example"), "utf-8");
    expect(example).toMatch(/^JWT_SECRET=$/m);
    expect(example).not.toContain("SUPERSECURESECRET");
    expect(example).not.toContain(a.JWT_SECRET);
    expect(fs.statSync(path.join(workDir, "secret-a", ".env")).mode & 0o777).toBe(0o600);
  });

  it("removes a partially generated project on failure but never an existing folder", () => {
    const existing = path.join(workDir, "existing");
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, "keep.txt"), "user data");

    expect(() => generate("existing", "postgresql", [])).toThrow(/already exists/);
    expect(fs.readFileSync(path.join(existing, "keep.txt"), "utf-8")).toBe("user data");

    expect(() => generate("bad-plugin", "postgresql", ["socket"])).toThrow(/Unknown plugin/);
    expect(fs.existsSync(path.join(workDir, "bad-plugin"))).toBe(false);

    expect(() =>
      compose.generateProject({
        target: path.join(workDir, "broken"),
        name: "broken",
        db: "postgresql",
        plugins: [],
        assetsDir: path.join(workDir, "does-not-exist"),
      }),
    ).toThrow();
    expect(fs.existsSync(path.join(workDir, "broken"))).toBe(false);
  });

  it("CLI runs non-interactively and reports invalid input with a non-zero exit", () => {
    const cli = path.join(cliRoot, "index.js");
    execFileSync(process.execPath, [cli, "flag-app", "--db=mongodb", "--plugins", "none", "--skip-install"], {
      cwd: workDir,
      stdio: "pipe",
    });
    expect(fs.existsSync(path.join(workDir, "flag-app", "package.json"))).toBe(true);

    expect(() =>
      execFileSync(process.execPath, [cli, "../evil", "--yes", "--skip-install"], { cwd: workDir, stdio: "pipe" }),
    ).toThrow();
    expect(fs.existsSync(path.join(workDir, "..", "evil"))).toBe(false);
  });
});

describe("generated project type-checks without optional plugins (fast, offline)", () => {
  // Uses the framework's node_modules, so it cannot detect missing packages
  // (the packaging smoke test does); it does detect core code that depends on
  // optional plugins' files or decorator types.
  it.each(["postgresql", "mongodb"])("%s", (db) => {
    const name = `tsc-${db}`;
    const { target } = generate(name, db, []);
    fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(target, "node_modules"), "dir");
    if (db === "postgresql") {
      fs.cpSync(path.join(repoRoot, "src/generated"), path.join(target, "src/generated"), { recursive: true });
    }

    const tsc = path.join(repoRoot, "node_modules/typescript/bin/tsc");
    for (const project of ["tsconfig.json", "tsconfig.test.json"]) {
      try {
        execFileSync(process.execPath, [tsc, "--noEmit", "-p", project], { cwd: target, stdio: "pipe" });
      } catch (error) {
        const output = String((error as { stdout?: Buffer }).stdout ?? error);
        throw new Error(`${db} ${project} failed:\n${output.slice(0, 2000)}`);
      }
    }
  }, 120_000);
});

describe("make:module generator", () => {
  const tsNode = path.join(repoRoot, "node_modules/ts-node/dist/bin.js");
  const makeModule = (cwd: string, name: string) =>
    execFileSync(process.execPath, [tsNode, "-r", "tsconfig-paths/register", "src/scripts/make-module.ts", name], {
      cwd,
      stdio: "pipe",
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: "1" },
    }).toString();

  function appWithModules(name: string, db: string) {
    const { target } = generate(name, db, []);
    fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(target, "node_modules"), "dir");
    return target;
  }

  it("creates a type-correct kebab-case module in a MongoDB app", () => {
    const target = appWithModules("mm-mongo", "mongodb");
    expect(makeModule(target, "order-items")).toContain('Module "order-items" created');

    const dir = path.join(target, "src/modules/order-items");
    expect(fs.readFileSync(path.join(dir, "index.ts"), "utf-8")).toContain("export async function orderItemsModule");
    expect(fs.existsSync(path.join(dir, "order-items.model.ts"))).toBe(true);

    const tsc = path.join(repoRoot, "node_modules/typescript/bin/tsc");
    try {
      execFileSync(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], { cwd: target, stdio: "pipe" });
    } catch (error) {
      throw new Error(String((error as { stdout?: Buffer }).stdout ?? error).slice(0, 2000));
    }
  }, 120_000);

  it("adds the Prisma model in a PostgreSQL app and refuses duplicates", () => {
    const target = appWithModules("mm-pg", "postgresql");
    const output = makeModule(target, "invoice");
    expect(output).toContain("Added model Invoice to prisma/schema.prisma");
    expect(fs.readFileSync(path.join(target, "prisma/schema.prisma"), "utf-8")).toMatch(/^model Invoice \{/m);
    expect(fs.readFileSync(path.join(target, "src/modules/invoice/invoice.repository.ts"), "utf-8")).toContain(
      "this.db.getClient().invoice",
    );
    expect(() => makeModule(target, "invoice")).toThrow();
  }, 120_000);

  it.each(["Order", "order_items", "order--items", "../escape", "auth"])("rejects module name %p", (name) => {
    const target = path.join(workDir, "mm-mongo");
    expect(() => makeModule(target, name)).toThrow();
  });
});
