import * as fs from "fs";
import * as path from "path";
import { FastifyInstance } from "fastify";
import { toKebabCase } from "@/utils/string/case";
import { config } from "@/config";

export async function registerModules(app: FastifyInstance) {
  const modulesPath = path.join(process.cwd(), "src/modules");
  const moduleDirs = fs.readdirSync(modulesPath);
  const basePrefix = `${config.app.api.prefix}/${config.app.api.version}`;

  for (const dir of moduleDirs) {
    const modulePath = path.join(modulesPath, dir, "index.ts");

    if (!fs.existsSync(modulePath)) continue;

    const moduleImport = await import(modulePath);
    const moduleFunction = moduleImport[`${dir}Module`];

    if (typeof moduleFunction === "function") {
      const systemModules = ["health", "metrics"];
      const isSystemModule = systemModules.includes(dir);

      const prefix = isSystemModule
        ? "" // 👈 no prefix
        : `${basePrefix}/${dir}`;

      await app.register(moduleFunction, { prefix });
      // await app.register(moduleFunction, {
      //   prefix: `${basePrefix}/toKebabCase(${dir})`,
      // });

      app.log.info(`✅ Module loaded: ${dir}`);
    }
  }
}
