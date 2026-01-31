module.exports = {
  testEnvironment: "node",
  collectCoverageFrom: ["**/*.js", "!node_modules/**", "!coverage/**"],
  testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
};
