/**
 * Tests for no-unknown-return ESLint rule
 */

const { RuleTester } = require("eslint");
const rule = require("./no-unknown-return");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require("@typescript-eslint/parser"),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-unknown-return", rule, {
  valid: [
    // Type guard functions (v is Type) are allowed
    {
      code: `
        export function isPlainObject(v: unknown): v is PlainObject {
          return typeof v === "object" && v !== null;
        }
      `,
    },
    // Functions with specific return types
    {
      code: `
        function getString(): string {
          return "hello";
        }
      `,
    },
    {
      code: `
        function getNumber(): number {
          return 42;
        }
      `,
    },
    // Functions with RuntimeValue return type
    {
      code: `
        function getValue(): RuntimeValue {
          return { value: 42 };
        }
      `,
    },
    // Arrow functions with specific types
    {
      code: `
        const getArray = (): string[] => ["a", "b"];
      `,
    },
    // Methods with specific types
    {
      code: `
        class MyClass {
          getValue(): string {
            return "test";
          }
        }
      `,
    },
    // Functions without explicit return type (inferred)
    {
      code: `
        function test() {
          return 42;
        }
      `,
    },
    // Type parameters accepting unknown are OK
    {
      code: `
        function process(val: unknown): string {
          return String(val);
        }
      `,
    },
  ],

  invalid: [
    // Function with unknown return type
    {
      code: `
        function getValue(): unknown {
          return 42;
        }
      `,
      errors: [
        {
          messageId: "unknownReturn",
        },
      ],
    },
    // Arrow function with unknown return type
    {
      code: `
        const process = (val: string): unknown => {
          return val;
        };
      `,
      errors: [
        {
          messageId: "unknownReturn",
        },
      ],
    },
    // Method with unknown return type
    {
      code: `
        class MyClass {
          process(): unknown {
            return "test";
          }
        }
      `,
      errors: [
        {
          messageId: "unknownReturn",
        },
      ],
    },
    // Function expression with unknown return type
    {
      code: `
        const fn = function(): unknown {
          return 123;
        };
      `,
      errors: [
        {
          messageId: "unknownReturn",
        },
      ],
    },
    // Exported function with unknown return type
    {
      code: `
        export function compute(): unknown {
          return { value: 42 };
        }
      `,
      errors: [
        {
          messageId: "unknownReturn",
        },
      ],
    },
  ],
});

console.log("All tests passed!");
