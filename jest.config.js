/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  // Consistent execution: avoid worker scheduling differences while debugging
  // hangs/timeouts.
  maxWorkers: 1,
  testTimeout: 10000,
};
