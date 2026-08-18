export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node10",
        },
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts"],
};
