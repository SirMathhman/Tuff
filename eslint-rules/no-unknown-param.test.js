/**
 * @fileoverview Tests for no-unknown-param rule
 * @author SirMathhman
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require("./no-unknown-param");
const RuleTester = require("eslint").RuleTester;
const tsParser = require("@typescript-eslint/parser");

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-unknown-param", rule, {
  valid: [
    // No type annotation
    {
      code: "function foo(x) { return x; }",
    },
    // Specific type annotation
    {
      code: "function foo(x: string): string { return x; }",
    },
    // RuntimeValue type
    {
      code: "function foo(x: RuntimeValue): RuntimeValue { return x; }",
    },
    // Multiple parameters with specific types
    {
      code: "function foo(x: number, y: string): number { return x; }",
    },
    // Arrow function with specific type
    {
      code: "const foo = (x: number): number => x;",
    },
    // Method with specific types
    {
      code: "class Foo { method(x: string): void {} }",
    },
    // Interface method signature
    {
      code: "interface Foo { method(x: string): void; }",
    },
    // Rest parameter with specific type
    {
      code: "function foo(...args: string[]): void {}",
    },
    // Default parameter with specific type
    {
      code: "function foo(x: number = 5): number { return x; }",
    },
    // Union type
    {
      code: "function foo(x: string | number): void {}",
    },
    // Any type (not unknown)
    {
      code: "function foo(x: any): void {}",
    },
  ],

  invalid: [
    // Function parameter with unknown type
    {
      code: "function foo(x: unknown): void {}",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Multiple parameters, one with unknown
    {
      code: "function foo(x: string, y: unknown): void {}",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "y" },
        },
      ],
    },
    // Multiple parameters with unknown
    {
      code: "function foo(x: unknown, y: unknown): void {}",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
        {
          messageId: "noUnknownParam",
          data: { paramName: "y" },
        },
      ],
    },
    // Arrow function with unknown parameter
    {
      code: "const foo = (x: unknown): void => {};",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Method with unknown parameter
    {
      code: "class Foo { method(x: unknown): void {} }",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Interface method signature with unknown
    {
      code: "interface Foo { method(x: unknown): void; }",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Function expression with unknown
    {
      code: "const foo = function(x: unknown): void {};",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Default parameter with unknown type
    {
      code: "function foo(x: unknown = 5): void {}",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
    // Exported function with unknown parameter
    {
      code: "export function foo(x: unknown): void {}",
      errors: [
        {
          messageId: "noUnknownParam",
          data: { paramName: "x" },
        },
      ],
    },
  ],
});

console.log("All no-unknown-param tests passed!");
