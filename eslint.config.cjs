module.exports = [
  // ignore common files/dirs
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "bun.lock",
      "/*.log",
      "coverage/",
      ".turbo/",
      ".cache/",
    ],
  },

  // TypeScript + JS rules for source files
  {
    files: ["**/*.{ts,tsx,js}"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      complexity: ["warn", { max: 15 }],
    },
  },
];
