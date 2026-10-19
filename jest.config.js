/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    // ESM-only dependencies (cookie@2, required by Fastify's inject via
    // light-my-request) are compiled to CommonJS for Jest's module runtime,
    // which cannot require() ES modules on Node < 24.9.
    "^.+\\.m?js$": [
      "ts-jest",
      {
        tsconfig: { allowJs: true, module: "commonjs", target: "ES2020", esModuleInterop: true },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!(cookie)/)"],
};
