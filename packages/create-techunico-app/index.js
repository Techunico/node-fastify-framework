#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");
const {
  DATABASES,
  PACKAGE_MANAGERS,
  GenerationError,
  generateProject,
  readManifest,
  resolvePlugins,
  resolveTarget,
} = require("./lib/compose");

const USAGE = `
Usage: create-techunico-app <project-name> [options]

Options:
  --db <postgresql|mongodb>      Database (default: postgresql with --yes)
  --plugins <list|none>          Comma-separated optional plugins (e.g. redis,cache)
  --pm <npm|yarn|pnpm>           Package manager (default: npm with --yes)
  --skip-install                 Do not install dependencies
  -y, --yes                      Use defaults instead of prompting
  -h, --help                     Show this help
`;

function parseArgs(argv) {
  const options = { install: true, yes: false };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = (flag) => {
      const inline = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : undefined;
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new GenerationError(`${flag} requires a value`);
      }
      i += 1;
      return next;
    };

    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-y" || arg === "--yes") options.yes = true;
    else if (arg === "--skip-install") options.install = false;
    else if (arg === "--db" || arg.startsWith("--db=")) options.db = takeValue("--db");
    else if (arg === "--pm" || arg.startsWith("--pm=")) options.pm = takeValue("--pm");
    else if (arg === "--plugins" || arg.startsWith("--plugins=")) {
      const value = takeValue("--plugins");
      options.plugins =
        value === "none" || value === ""
          ? []
          : value.split(",").map((p) => p.trim()).filter(Boolean);
    } else if (arg.startsWith("-")) throw new GenerationError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (positional.length > 1) {
    throw new GenerationError(`Unexpected arguments: ${positional.slice(1).join(" ")}`);
  }
  options.name = positional[0];
  return options;
}

async function promptForMissing(options, manifest) {
  const needsPrompt = !options.db || !options.plugins || !options.pm;
  if (!needsPrompt) return options;

  if (options.yes || !process.stdin.isTTY) {
    return {
      ...options,
      db: options.db ?? "postgresql",
      plugins: options.plugins ?? [],
      pm: options.pm ?? "npm",
    };
  }

  const inquirer = require("inquirer");
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "db",
      message: "Select database:",
      when: !options.db,
      choices: DATABASES.map((value) => ({ name: manifest.databases[value].label, value })),
    },
    {
      type: "checkbox",
      name: "plugins",
      message: "Select optional plugins:",
      when: !options.plugins,
      choices: Object.entries(manifest.plugins).map(([value, entry]) => ({
        name: `${entry.label} — ${entry.description}${entry.requires.length ? ` (needs ${entry.requires.join(", ")})` : ""}`,
        value,
      })),
    },
    {
      type: "list",
      name: "pm",
      message: "Select package manager:",
      when: !options.pm,
      choices: PACKAGE_MANAGERS,
    },
  ]);

  return { ...options, ...answers };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) return { ok: false, reason: result.error.message };
  if (result.status !== 0) return { ok: false, reason: `exit code ${result.status}` };
  return { ok: true };
}

function scriptCommand(pm, script) {
  return pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const target = resolveTarget(process.cwd(), options.name);
  const manifest = readManifest();
  const answers = await promptForMissing(options, manifest);

  if (!PACKAGE_MANAGERS.includes(answers.pm)) {
    throw new GenerationError(`Unsupported package manager "${answers.pm}"`);
  }

  const plugins = resolvePlugins(manifest, answers.plugins);
  const added = plugins.filter((name) => !answers.plugins.includes(name));
  if (added.length) {
    console.log(`ℹ️  Also enabling required plugin(s): ${added.join(", ")}`);
  }

  const result = generateProject({
    target,
    name: options.name,
    db: answers.db,
    plugins,
  });

  console.log(`\n✅ Project ${options.name} created (${answers.db}; plugins: ${plugins.join(", ") || "none"})`);
  console.log("🔐 Generated unique JWT secrets in .env (not printed). Keep .env out of version control.");

  const relative = path.relative(process.cwd(), result.target) || ".";

  if (!answers.install) {
    console.log(`\nNext steps:\n\n  cd ${relative}\n  ${answers.pm} install`);
    if (answers.db === "postgresql") console.log(`  ${scriptCommand(answers.pm, "generate")}`);
    console.log(`  ${scriptCommand(answers.pm, "dev")}`);
    return 0;
  }

  console.log(`\n📦 Installing dependencies using ${answers.pm}...\n`);
  const install = run(answers.pm, ["install"], result.target);
  if (!install.ok) {
    console.error(
      `\n❌ Dependency installation failed (${install.reason}). The project was kept at ${relative}.\n` +
        `   Fix the problem, then run \`${answers.pm} install\` inside it.`,
    );
    return 1;
  }

  if (answers.db === "postgresql") {
    console.log("\n🔧 Generating Prisma client...\n");
    const generate = run(answers.pm === "npm" ? "npx" : answers.pm, ["prisma", "generate"], result.target);
    if (!generate.ok) {
      console.error(
        `\n❌ Prisma client generation failed (${generate.reason}). Run \`${scriptCommand(answers.pm, "generate")}\` inside ${relative}.`,
      );
      return 1;
    }
  }

  console.log(`\n🚀 Next steps:\n\n  cd ${relative}`);
  if (answers.db === "postgresql") {
    console.log(`  ${scriptCommand(answers.pm, "migrate")}   # after PostgreSQL is running`);
  }
  console.log(`  ${scriptCommand(answers.pm, "seed")}      # optional, after the database is running`);
  console.log(`  ${scriptCommand(answers.pm, "dev")}`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof GenerationError) {
      console.error(`❌ ${error.message}`);
      if (/project name/i.test(error.message)) console.error(USAGE);
    } else {
      console.error("❌ Unexpected error:", error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  });
