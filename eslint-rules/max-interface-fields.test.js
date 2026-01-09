/**
 * Tests for max-interface-fields ESLint rule
 */

const { RuleTester } = require("eslint");
const rule = require("./max-interface-fields");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require("@typescript-eslint/parser"),
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
});

ruleTester.run("max-interface-fields", rule, {
  valid: [
    // Interface with exactly 5 fields
    {
      code: `
        interface FiveFields {
          a: string;
          b: number;
          c: boolean;
          d: string[];
          e: number;
        }
      `,
      options: [{ max: 5 }],
    },
    // Interface with 3 fields
    {
      code: `
        interface ThreeFields {
          name: string;
          age: number;
          active: boolean;
        }
      `,
      options: [{ max: 5 }],
    },
    // Interface with fields and methods (methods don't count)
    {
      code: `
        interface WithMethods {
          field1: string;
          field2: number;
          field3: boolean;
          field4: string[];
          field5: number;
          method1(): void;
          method2(x: number): string;
          method3(a: string, b: number): boolean;
        }
      `,
      options: [{ max: 5 }],
    },
    // Interface with only methods (should pass)
    {
      code: `
        interface OnlyMethods {
          method1(): void;
          method2(x: number): string;
          method3(a: string, b: number): boolean;
          method4(): number;
          method5(): string;
          method6(): boolean;
        }
      `,
      options: [{ max: 5 }],
    },
    // Empty interface
    {
      code: `
        interface Empty {}
      `,
      options: [{ max: 5 }],
    },
  ],

  invalid: [
    // Interface with 6 fields (exceeds default limit of 5)
    {
      code: `
        interface SixFields {
          a: string;
          b: number;
          c: boolean;
          d: string[];
          e: number;
          f: boolean;
        }
      `,
      options: [{ max: 5 }],
      errors: [
        {
          messageId: "tooManyFields",
          data: { name: "SixFields", count: 6, max: 5 },
        },
      ],
    },
    // Interface with 7 fields
    {
      code: `
        interface SevenFields {
          field1: string;
          field2: number;
          field3: boolean;
          field4: string[];
          field5: number;
          field6: boolean;
          field7: string;
        }
      `,
      options: [{ max: 5 }],
      errors: [
        {
          messageId: "tooManyFields",
          data: { name: "SevenFields", count: 7, max: 5 },
        },
      ],
    },
    // Interface with 6 fields and methods (methods don't count, but still has 6 fields)
    {
      code: `
        interface SixFieldsWithMethods {
          field1: string;
          field2: number;
          field3: boolean;
          field4: string[];
          field5: number;
          field6: boolean;
          method1(): void;
          method2(x: number): string;
        }
      `,
      options: [{ max: 5 }],
      errors: [
        {
          messageId: "tooManyFields",
          data: { name: "SixFieldsWithMethods", count: 6, max: 5 },
        },
      ],
    },
    // Interface with 4 fields but max is 3
    {
      code: `
        interface FourFields {
          a: string;
          b: number;
          c: boolean;
          d: string;
        }
      `,
      options: [{ max: 3 }],
      errors: [
        {
          messageId: "tooManyFields",
          data: { name: "FourFields", count: 4, max: 3 },
        },
      ],
    },
  ],
});

console.log("All tests passed!");
