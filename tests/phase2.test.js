/**
 * Phase 2 Feature Tests
 * Tests for arrow functions, modules, Result type, and array methods
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { Lexer } from "../src/lexer.js";
import { Parser } from "../src/parser.js";
import { JSCodegen } from "../src/codegen-js.js";

it("Arrow functions: simple expression", () => {
  const code = "let double = (x) => x * 2;";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /double.*=.*\(\(x\) => \(x \* 2\)\)/);
});

it("Arrow functions: with closure", () => {
  const code =
    "fn makeCounter() { let count = 0; return () => count = count + 1; }";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /\(\(\) => \(count = \(count \+ 1\)\)\)/);
});

it("Module declaration", () => {
  const code = "module Math { fn square(x) { return x * x; } }";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /const Math = \{/);
  assert.match(js, /square\(x\)/);
});

it("Result type: Ok", () => {
  const code = "let result = Ok(42);";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /Ok\(42\)/);
});

it("Result type: Err", () => {
  const code = 'let error = Err("failed");';
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /Err\("failed"\)/);
});

it("Array methods: map", () => {
  const code = "let doubled = [1, 2, 3].map((x) => x * 2);";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /\.map\(\(\(x\) => \(x \* 2\)\)\)/);
});

it("Array methods: filter", () => {
  const code = "let evens = [1, 2, 3, 4].filter((x) => x % 2 == 0);";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /\.filter\(\(\(x\) => \(\(x % 2\) === 0\)\)\)/);
});

it("Extern type declaration", () => {
  const code = "extern type Map;";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /\/\/ extern type Map/);
});

it("Use statement", () => {
  const code = "use { A, B } from C;";
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const js = new JSCodegen(ast).generate();
  assert.match(js, /import \{ A, B \} from "\.\/C\.js"/);
});
