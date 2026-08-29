import baseConfig from "./eslint.config.ts";

/**
 * ESLint flat config for the architecture reviewer.
 * Inherits every rule from the base config; reviewer-specific rules go here.
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "max-lines": [
        "warn",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
];
