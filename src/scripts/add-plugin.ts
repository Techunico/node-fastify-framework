import fs from "fs";
import path from "path";

const plugin = process.argv[2];

if (!plugin) {
  console.error("❌ Please provide plugin name");
  process.exit(1);
}

const envPath = path.resolve(".env");

if (!fs.existsSync(envPath)) {
  console.error("❌ .env file not found");
  process.exit(1);
}

let content = fs.readFileSync(envPath, "utf-8");

// Extract PLUGINS line
const match = content.match(/^PLUGINS=(.*)$/m);

let plugins: string[] = [];

if (match && match[1]) {
  plugins = match[1].split(",").map(p => p.trim()).filter(Boolean);
}

// Avoid duplicates
if (plugins.includes(plugin)) {
  console.log(`⚠️ Plugin "${plugin}" already enabled`);
  process.exit(0);
}

// Add plugin
plugins.push(plugin);

// Replace or add PLUGINS line
if (match) {
  content = content.replace(/^PLUGINS=(.*)$/m, `PLUGINS=${plugins.join(",")}`);
} else {
  content += `\nPLUGINS=${plugins.join(",")}\n`;
}

fs.writeFileSync(envPath, content);

console.log(`✅ Plugin "${plugin}" enabled`);