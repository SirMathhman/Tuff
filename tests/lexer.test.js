import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Lexer, TokenType } from "../src/lexer.js";

test("Lexer: simple number", () => {
  const lexer = new Lexer("42");
  const tokens = lexer.tokenize();
  assert.equal(tokens[0].type, TokenType.NUMBER);
  assert.equal(tokens[0].value, 42);
});

test("Lexer: string", () => {
  const lexer = new Lexer('"hello"');
  const tokens = lexer.tokenize();
  assert.equal(tokens[0].type, TokenType.STRING);
  assert.equal(tokens[0].value, "hello");
});

test("Lexer: keywords", () => {
  const lexer = new Lexer("fn var return if else while true false nil");
  const tokens = lexer.tokenize();
  assert.equal(tokens[0].type, TokenType.FN);
  assert.equal(tokens[1].type, TokenType.VAR);
  assert.equal(tokens[2].type, TokenType.RETURN);
  assert.equal(tokens[3].type, TokenType.IF);
  assert.equal(tokens[4].type, TokenType.ELSE);
  assert.equal(tokens[5].type, TokenType.WHILE);
  assert.equal(tokens[6].type, TokenType.TRUE);
  assert.equal(tokens[7].type, TokenType.FALSE);
  assert.equal(tokens[8].type, TokenType.NIL);
});

test("Lexer: operators", () => {
  const lexer = new Lexer("+ - * / == != < > <= >=");
  const tokens = lexer.tokenize();
  assert.equal(tokens[0].type, TokenType.PLUS);
  assert.equal(tokens[1].type, TokenType.MINUS);
  assert.equal(tokens[2].type, TokenType.STAR);
  assert.equal(tokens[3].type, TokenType.SLASH);
  assert.equal(tokens[4].type, TokenType.EQ);
  assert.equal(tokens[5].type, TokenType.NEQ);
  assert.equal(tokens[6].type, TokenType.LT);
  assert.equal(tokens[7].type, TokenType.GT);
  assert.equal(tokens[8].type, TokenType.LTE);
  assert.equal(tokens[9].type, TokenType.GTE);
});

test("Lexer: function definition", () => {
  const lexer = new Lexer("fn add(a, b) { return a + b; }");
  const tokens = lexer.tokenize();
  assert.equal(tokens[0].type, TokenType.FN);
  assert.equal(tokens[1].type, TokenType.IDENTIFIER);
  assert.equal(tokens[1].value, "add");
  assert.equal(tokens[2].type, TokenType.LPAREN);
});
