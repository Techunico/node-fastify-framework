#!/usr/bin/env node
/**
 * Packaging smoke gate.
 *
 *   build template → npm pack CLI → install tarball OUTSIDE the repository →
 *   generate {postgresql, mongodb} × {no plugins, all plugins} → npm install →
 *   typecheck → (build/start when available) → HTTP checks → shutdown.
 *
 * Everything runs under a fresh directory in os.tmpdir(), so the framework's
 * own node_modules can never satisfy a missing dependency. Only directories
 * created by this script are removed.
 *
 * Databases: by default isolated postgres / mongod / redis-server processes
 * are started on random ports inside the temp directory. In CI, point the
 * script at service containers instead:
 *   SMOKE_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432
 *   SMOKE_MONGO_URL=mongodb://127.0.0.1:27017
 *   SMOKE_REDIS_HOST=127.0.0.1 SMOKE_REDIS_PORT=6379
 *
 * Options (env): SMOKE_CASES=pg-none,mongo-all  SMOKE_KEEP=1 (keep temp dir)
 *                SMOKE_REQUIRE_START=1 (fail instead of skipping when no DB is available)
 */
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliRoot = path.join(repoRoot, "packages/create-techunico-app");

const ALL_PLUGINS = ["redis", "cache", "queue", "events", "geo", "cloudinary", "payment"];
const OPTIONAL_PACKAGES = {
  redis: ["ioredis"],
  queue: ["bullmq"],
  geo: ["axios", "geolib"],
  cloudinary: ["cloudinary"],
  payment: ["razorpay"],
};

const CASES = [
  { id: "pg-none", db: "postgresql", plugins: [] },
  { id: "pg-all", db: "postgresql", plugins: ALL_PLUGINS },
  { id: "mongo-none", db: "mongodb", plugins: [] },
  { id: "mongo-all", db: "mongodb", plugins: ALL_PLUGINS },
].filter((c) => !process.env.SMOKE_CASES || process.env.SMOKE_CASES.split(",").includes(c.id));

// ─── reporting ──────────────────────────────────────────────────────────────

const results = [];
function record(caseId, check, status, detail = "") {
  results.push({ caseId, check, status, detail });
  const icon = status === "pass" ? "✅" : status === "skip" ? "⏭️ " : "❌";
  console.log(`${icon} [${caseId}] ${check}${detail ? ` — ${detail}` : ""}`);
}
function assert(caseId, check, condition, detail) {
  record(caseId, check, condition ? "pass" : "fail", condition ? "" : detail);
  return condition;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Environment for child processes, without anything that could leak repo modules. */
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of ["NODE_PATH", "TS_NODE_PROJECT", "npm_config_prefix", "INIT_CWD"]) delete env[key];
  for (const key of Object.keys(env)) if (key.startsWith("npm_package_") || key.startsWith("npm_lifecycle")) delete env[key];
  return env;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    env: cleanEnv(options.env),
    cwd: options.cwd,
    timeout: options.timeout ?? 15 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    error: result.error,
  };
}

function tail(text, lines = 25) {
  return text.trim().split("\n").slice(-lines).join("\n");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, { timeoutMs = 30_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastError ?? new Error("timed out");
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function which(binary) {
  const candidates = [binary, `/opt/homebrew/opt/postgresql@17/bin/${binary}`, `/usr/lib/postgresql/17/bin/${binary}`];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

// ─── infrastructure ─────────────────────────────────────────────────────────

const processes = [];

async function startInfra(tmp) {
  const infra = { pg: null, mongo: null, redis: null, notes: [] };

  if (process.env.SMOKE_PG_URL) infra.pg = process.env.SMOKE_PG_URL.replace(/\/$/, "");
  else {
    const initdb = which("initdb");
    const postgres = which("postgres");
    if (initdb && postgres) {
      const dataDir = path.join(tmp, "pg-data");
      const init = run(initdb, ["-D", dataDir, "-U", "smoke", "-A", "trust", "-E", "UTF8", "--no-locale"]);
      if (init.ok) {
        const port = await freePort();
        const child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-h", "127.0.0.1", "-c", "unix_socket_directories="], {
          stdio: ["ignore", "ignore", "pipe"],
        });
        processes.push(child);
        await waitFor(() => portOpen(port), { timeoutMs: 20_000 });
        infra.pg = `postgresql://smoke@127.0.0.1:${port}`;
      } else infra.notes.push(`initdb failed: ${tail(init.output, 3)}`);
    } else infra.notes.push("postgres binaries not found");
  }

  if (process.env.SMOKE_MONGO_URL) infra.mongo = process.env.SMOKE_MONGO_URL.replace(/\/$/, "");
  else if (which("mongod")) {
    const dbPath = path.join(tmp, "mongo-data");
    fs.mkdirSync(dbPath);
    const port = await freePort();
    const child = spawn("mongod", ["--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet"], {
      stdio: "ignore",
    });
    processes.push(child);
    await waitFor(() => portOpen(port), { timeoutMs: 30_000 });
    infra.mongo = `mongodb://127.0.0.1:${port}`;
  } else infra.notes.push("mongod not found");

  if (process.env.SMOKE_REDIS_HOST) {
    infra.redis = { host: process.env.SMOKE_REDIS_HOST, port: Number(process.env.SMOKE_REDIS_PORT ?? 6379) };
  } else if (which("redis-server")) {
    const port = await freePort();
    const child = spawn("redis-server", ["--port", String(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"], {
      stdio: "ignore",
    });
    processes.push(child);
    await waitFor(() => portOpen(port), { timeoutMs: 15_000 });
    infra.redis = { host: "127.0.0.1", port };
  } else infra.notes.push("redis-server not found");

  return infra;
}

function stopInfra() {
  for (const child of processes) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

async function http(base, method, url, { body, token } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // non-JSON (e.g. /metrics)
  }
  return { status: response.status, json };
}

function forgeAdminToken() {
  // The historical attack: sign with the hardcoded admin key.
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({ id: "1", role: "admin", permissions: ["*"], userType: "admin", tokenType: "access", iat: now, exp: now + 600 });
  const signature = createHmac("sha256", "secret_admin").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// ─── checks per generated application ───────────────────────────────────────

function readEnvFile(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

function canResolve(appDir, pkg) {
  const probe = run(process.execPath, ["-e", `require.resolve(${JSON.stringify(pkg)})`], { cwd: appDir });
  return probe.ok;
}

async function startApp(c, appDir, env) {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf-8"));
  const useBuild = Boolean(pkg.scripts.build && pkg.scripts.start);

  if (useBuild) {
    const build = run("npm", ["run", "build"], { cwd: appDir, env });
    if (!assert(c.id, "npm run build", build.ok, tail(build.output))) return null;
  }

  const port = await freePort();
  const args = useBuild ? ["run", "start"] : null;
  const child = useBuild
    ? spawn("npm", args, { cwd: appDir, env: cleanEnv({ ...env, PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] })
    : spawn(
        process.execPath,
        ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", "src/server.ts"],
        { cwd: appDir, env: cleanEnv({ ...env, PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] },
      );
  processes.push(child);

  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => (await http(base, "GET", "/health")).status === 200, { timeoutMs: 60_000 });
  } catch {
    assert(c.id, `server starts (${useBuild ? "npm start" : "ts-node"})`, false, tail(output, 30));
    child.kill("SIGKILL");
    return null;
  }
  record(c.id, `server starts (${useBuild ? "npm start" : "ts-node"})`, "pass");
  return { child, base, getOutput: () => output };
}

async function stopApp(c, server) {
  const exited = new Promise((resolve) => server.child.once("exit", (code, signal) => resolve({ code, signal })));
  server.child.kill("SIGTERM");
  const outcome = await Promise.race([exited, new Promise((r) => setTimeout(() => r(null), 15_000))]);
  if (!outcome) {
    server.child.kill("SIGKILL");
    assert(c.id, "stops within 15s of SIGTERM", false, "process had to be killed");
    return;
  }
  record(c.id, "stops within 15s of SIGTERM", "pass", `exit ${outcome.code ?? outcome.signal}`);
}

async function checkApp(c, appDir, infra, secrets) {
  // Files
  assert(c.id, ".gitignore exists and ignores .env", fs.existsSync(path.join(appDir, ".gitignore")) &&
    fs.readFileSync(path.join(appDir, ".gitignore"), "utf-8").split("\n").includes(".env"), "missing or incomplete .gitignore");

  const env = readEnvFile(path.join(appDir, ".env"));
  const example = readEnvFile(path.join(appDir, ".env.example"));
  assert(c.id, ".env has strong unique JWT secrets", env.JWT_SECRET?.length >= 64 && env.JWT_ADMIN_SECRET?.length >= 64 &&
    !secrets.has(env.JWT_SECRET) && !secrets.has(env.JWT_ADMIN_SECRET), "weak or reused secret");
  secrets.add(env.JWT_SECRET);
  secrets.add(env.JWT_ADMIN_SECRET);
  assert(c.id, ".env.example has no secret", example.JWT_SECRET === "" && !fs.readFileSync(path.join(appDir, ".env.example"), "utf-8").includes("SUPERSECURESECRET"), "secret present in .env.example");

  // Dependencies
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf-8"));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [plugin, packages] of Object.entries(OPTIONAL_PACKAGES)) {
    for (const p of packages) {
      if (c.plugins.includes(plugin)) {
        assert(c.id, `enabled plugin ${plugin}: ${p} installed`, Boolean(declared[p]) && canResolve(appDir, p), `${p} missing`);
      } else {
        assert(c.id, `disabled plugin ${plugin}: ${p} absent`, !declared[p] && !canResolve(appDir, p), `${p} is declared or resolvable`);
      }
    }
  }
  const otherDb = c.db === "postgresql" ? "mongoose" : "@prisma/client";
  assert(c.id, `other database driver (${otherDb}) absent`, !declared[otherDb] && !canResolve(appDir, otherDb), `${otherDb} present`);
  assert(c.id, "socket.io / inquirer absent", !canResolve(appDir, "socket.io") && !canResolve(appDir, "inquirer"), "unexpected package");

  // Type-check (and tests when the template provides them)
  const typecheck = run("npm", ["run", "typecheck"], { cwd: appDir });
  assert(c.id, "npm run typecheck", typecheck.ok, tail(typecheck.output));

  if (pkg.scripts.test) {
    const test = run("npm", ["test"], { cwd: appDir, env: { CI: "1" } });
    assert(c.id, "npm test", test.ok, tail(test.output));
  }

  // Start
  const dbAvailable = c.db === "postgresql" ? infra.pg : infra.mongo;
  const redisNeeded = c.plugins.includes("redis");
  if (!dbAvailable || (redisNeeded && !infra.redis)) {
    const reason = `no ${!dbAvailable ? c.db : "redis"} available (${infra.notes.join("; ")})`;
    record(c.id, "start + HTTP checks", process.env.SMOKE_REQUIRE_START ? "fail" : "skip", reason);
    return;
  }

  const dbName = `smoke_${c.id.replace(/-/g, "_")}_${randomBytes(3).toString("hex")}`;
  const runtimeEnv = {
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    PLUGINS: c.plugins.join(","),
    ...(c.db === "postgresql" ? { DATABASE_URL: `${infra.pg}/${dbName}` } : { MONGO_URI: `${infra.mongo}/${dbName}` }),
    ...(infra.redis ? { REDIS_HOST: infra.redis.host, REDIS_PORT: String(infra.redis.port) } : {}),
    // Plugin credentials: format-valid placeholders; no external calls happen at startup.
    GEO_PROVIDER: "google",
    GOOGLE_MAPS_API_KEY: "smoke-google-key",
    GOOGLE_MAPS_BASE_URL: "https://maps.googleapis.com",
    GOOGLE_ROUTES_BASE_URL: "https://routes.googleapis.com",
    GOOGLE_PLACES_BASE_URL: "https://places.googleapis.com",
    GOOGLE_ROADS_BASE_URL: "https://roads.googleapis.com",
    CLOUDINARY_CLOUD_NAME: "smoke-cloud",
    CLOUDINARY_API_KEY: "smoke-key",
    CLOUDINARY_API_SECRET: "smoke-secret",
    PAYMENT_PROVIDER: "razorpay",
    RAZORPAY_KEY_ID: "rzp_test_SmokeKey123",
    RAZORPAY_KEY_SECRET: "smoke-razorpay-secret-value",
    RAZORPAY_WEBHOOK_SECRET: "smoke-webhook-secret-value",
  };

  if (c.db === "postgresql") {
    const push = run("npx", ["prisma", "db", "push"], { cwd: appDir, env: runtimeEnv });
    if (!assert(c.id, "prisma db push", push.ok, tail(push.output))) return;
  }
  const seed = run("npm", ["run", "seed"], { cwd: appDir, env: runtimeEnv });
  if (!assert(c.id, "npm run seed", seed.ok, tail(seed.output))) return;
  const reseed = run("npm", ["run", "seed"], { cwd: appDir, env: runtimeEnv });
  assert(c.id, "seed is idempotent", reseed.ok, tail(reseed.output));

  const server = await startApp(c, appDir, runtimeEnv);
  if (!server) return;

  try {
    const ready = await http(server.base, "GET", "/ready");
    assert(c.id, "GET /ready → 200", ready.status === 200, JSON.stringify(ready.json));
    if (redisNeeded) {
      assert(c.id, "readiness includes redis", ready.json?.data?.checks?.redis?.status === "ok", JSON.stringify(ready.json));
    }

    const email = `smoke-${randomBytes(4).toString("hex")}@example.com`;
    const register = await http(server.base, "POST", "/api/v1/auth/register", { body: { name: "Smoke", email, password: "correct-horse-battery" } });
    assert(c.id, "register → 200", register.status === 200, JSON.stringify(register.json));

    const login = await http(server.base, "POST", "/api/v1/auth/login", { body: { email, password: "correct-horse-battery" } });
    const token = login.json?.data?.token;
    assert(c.id, "login → token", login.status === 200 && typeof token === "string", JSON.stringify(login.json));

    const me = await http(server.base, "GET", "/api/v1/auth/me", { token });
    assert(c.id, "GET /auth/me with token → 200", me.status === 200 && me.json?.data?.type === "user", JSON.stringify(me.json));

    const forged = await http(server.base, "GET", "/api/v1/auth/me", { token: forgeAdminToken() });
    assert(c.id, "forged admin token → 401", forged.status === 401, JSON.stringify(forged.json));

    const badLogin = await http(server.base, "POST", "/api/v1/auth/login", { body: { email, password: "wrong-password" } });
    assert(c.id, "wrong password → 401", badLogin.status === 401, String(badLogin.status));

    const logs = server.getOutput();
    assert(c.id, "logs contain no JWT secret or token", !logs.includes(env.JWT_SECRET) && !(token && logs.includes(token)), "secret found in logs");
  } finally {
    await stopApp(c, server);
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "techunico-smoke-"));
  if (tmp.startsWith(repoRoot)) throw new Error("temp dir must be outside the repository");
  console.log(`Smoke workspace: ${tmp}`);

  try {
    // 1. Build template + pack
    const build = run(process.execPath, ["-r", "ts-node/register/transpile-only", "src/scripts/build-template.ts"], { cwd: repoRoot });
    if (!assert("package", "build template", build.ok, tail(build.output))) return;

    const pack = run("npm", ["pack", "--json", "--pack-destination", tmp], { cwd: cliRoot });
    if (!assert("package", "npm pack", pack.ok, tail(pack.output))) return;
    const packInfo = JSON.parse(pack.output.slice(pack.output.indexOf("[")))[0];
    const files = packInfo.files.map((f) => f.path);
    const tarball = path.join(tmp, packInfo.filename);

    assert("package", "tarball contains template/_gitignore", files.includes("template/_gitignore"), "missing");
    assert("package", "tarball contains the manifest", files.includes("template/src/framework.manifest.json"), "missing");
    const forbidden = files.filter((f) =>
      /(^|\/)(\.env|\.DS_Store|test-compose\.js)$/.test(f) || f.includes("experimental/") || f.includes(".test-output") ||
      f.includes("scripts/build-template") || f.includes("src/generated/") || f.startsWith("scaffold/"),
    );
    assert("package", "tarball has no internal/dev files", forbidden.length === 0, forbidden.join(", "));

    // 2. Install CLI outside the repository
    const cliHome = path.join(tmp, "cli");
    fs.mkdirSync(cliHome);
    fs.writeFileSync(path.join(cliHome, "package.json"), JSON.stringify({ name: "smoke-cli-home", private: true }));
    const install = run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: cliHome });
    if (!assert("package", "install packed CLI", install.ok, tail(install.output))) return;

    const installedCli = path.join(cliHome, "node_modules/@techunico/node-framework");
    const cliPkg = JSON.parse(fs.readFileSync(path.join(installedCli, "package.json"), "utf-8"));
    const cliSources = [path.join(installedCli, "index.js"), ...fs.readdirSync(path.join(installedCli, "lib")).map((f) => path.join(installedCli, "lib", f))];
    const builtins = new Set(["fs", "path", "crypto", "child_process", "os", "url", "util"]);
    const required = new Set();
    for (const file of cliSources) {
      for (const match of fs.readFileSync(file, "utf-8").matchAll(/require\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
        if (!builtins.has(match[1]) && !match[1].startsWith("node:")) required.add(match[1]);
      }
    }
    const undeclared = [...required].filter((dep) => !cliPkg.dependencies?.[dep]);
    assert("package", "CLI runtime requires are declared", undeclared.length === 0, undeclared.join(", "));
    const unresolved = [...required].filter((dep) => !run(process.execPath, ["-e", `require.resolve(${JSON.stringify(dep)})`], { cwd: installedCli }).ok);
    assert("package", "CLI dependencies resolve from the installed package", unresolved.length === 0, unresolved.join(", "));

    const help = run(process.execPath, [path.join(installedCli, "index.js"), "--help"], { cwd: cliHome });
    assert("package", "CLI --help", help.ok && help.output.includes("Usage"), tail(help.output));
    const traversal = run(process.execPath, [path.join(installedCli, "index.js"), "../escape", "--yes", "--skip-install"], { cwd: cliHome });
    assert("package", "CLI rejects path traversal", !traversal.ok && !fs.existsSync(path.join(tmp, "escape")), tail(traversal.output));

    // 3. Infra
    const infra = await startInfra(tmp);
    console.log(`Infra: pg=${infra.pg ? "yes" : "no"} mongo=${infra.mongo ? "yes" : "no"} redis=${infra.redis ? "yes" : "no"} ${infra.notes.join("; ")}`);

    // 4. Generate + check each case
    const appsDir = path.join(tmp, "apps");
    fs.mkdirSync(appsDir);
    const secrets = new Set();

    for (const c of CASES) {
      const generate = run(
        process.execPath,
        [path.join(installedCli, "index.js"), c.id, "--db", c.db, "--plugins", c.plugins.join(",") || "none", "--pm", "npm"],
        { cwd: appsDir },
      );
      if (!assert(c.id, "generate + install", generate.ok, tail(generate.output, 40))) continue;
      await checkApp(c, path.join(appsDir, c.id), infra, secrets);
    }
  } finally {
    stopInfra();
    if (process.env.SMOKE_KEEP) console.log(`Kept ${tmp}`);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main()
  .catch((error) => {
    record("smoke", "unexpected error", "fail", error?.stack ?? String(error));
  })
  .finally(() => {
    const failed = results.filter((r) => r.status === "fail");
    const skipped = results.filter((r) => r.status === "skip");
    console.log(`\nSmoke summary: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
    for (const r of [...failed, ...skipped]) console.log(`  ${r.status.toUpperCase()} [${r.caseId}] ${r.check}${r.detail ? `: ${r.detail.split("\n")[0]}` : ""}`);
    process.exitCode = failed.length ? 1 : 0;
  });
