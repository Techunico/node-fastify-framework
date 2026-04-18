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

const templateDir = path.join(process.cwd(), "src/scripts/templates/module");

const files = fs.readdirSync(templateDir);

files.forEach((file) => {
  const content = fs
    .readFileSync(path.join(templateDir, file), "utf-8")
    .replace(/{{name}}/g, moduleName);

  const baseName = file.replace(".txt", "");
  let fileName = "";
  if (baseName !== "index.ts") {
    fileName = `${moduleName}.${baseName}`;
  } else{
    fileName = baseName;
  } 

  fs.writeFileSync(path.join(modulePath, fileName), content);
});

console.log(`✅ Module "${moduleName}" created successfully`);
