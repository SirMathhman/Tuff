module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        sourceMaps: true,
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: false,
            decorators: false,
          },
          target: "es2019",
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
};
