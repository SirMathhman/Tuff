/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageReporters: ["text", "lcov"],
  // We don't care about function, statement, and branch level coverage, only lines
  coverageThreshold: {
    global: {
      lines: 100,
      functions: 0,
      statements: 0,
      branches: 0,
    },
  },
};
