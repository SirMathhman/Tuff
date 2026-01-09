/**
 * Test for no-object-indexing rule
 */

const rule = require("./no-object-indexing");
const { RuleTester } = require("eslint");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require("@typescript-eslint/parser"),
    parserOptions: { ecmaVersion: 2020, sourceType: "module" },
  },
});

ruleTester.run("no-object-indexing", rule, {
  valid: [
    // Map usage is valid
    "type MyMap = Map<string, RuntimeValue>;",
    // Methods without string index signature
    `interface MyInterface {
      method(): void;
    }`,
  ],
  invalid: [
    {
      code: `interface PlainObject {
        [k: string]: RuntimeValue;
      }`,
      errors: [{ messageId: "objectIndexing" }],
    },
    {
      code: `interface Config {
        [key: string]: any;
      }`,
      errors: [{ messageId: "objectIndexing" }],
    },
  ],
});

console.log("All tests passed!");
