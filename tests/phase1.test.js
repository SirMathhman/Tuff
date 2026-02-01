import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Lexer, TokenType } from "../src/lexer.js";
import { Parser } from "../src/parser.js";
import { JSCodegen } from "../src/codegen-js.js";

test("For loops: basic range", () => {
  const source = `
fn print_range() {
  for (let i in 0..3) {
    print(i)
  }
}
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new JSCodegen(ast);
  const code = codegen.generate();

  assert(code.includes("for (let i = 0; i < 3; i++)"));
});

test("Let declaration: immutable", () => {
  const source = `
fn test() {
  let x = 42
  print(x)
}
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new JSCodegen(ast);
  const code = codegen.generate();

  assert(code.includes("let x = 42"));
});

test("Let mut: mutable", () => {
  const source = `
fn test() {
  let mut y = 10
  y = 20
}
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new JSCodegen(ast);
  const code = codegen.generate();

  assert(code.includes("let y = 10"));
  assert(code.includes("y = 20"));
});

test("Struct declaration", () => {
  const source = `
struct Point {
  x;
  y;
}
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new JSCodegen(ast);
  const code = codegen.generate();

  assert(code.includes("// struct Point"));
});

test("Break and continue statements", () => {
  const source = `
fn loop_test() {
  while (true) {
    break
    continue
  }
}
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new JSCodegen(ast);
  const code = codegen.generate();

  assert(code.includes("break;"));
  assert(code.includes("continue;"));
});
