import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only run the TypeScript tests. The .tuff integration tests compile into
    // ".dist/tuff-tests/**/*.test.mjs" which must NOT be collected by Vitest.
    include: ["src/test/ts/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.dist/**",
      "**/selfhost/**",
      "**/rt/**",
    ],
  },
});
