import { test, expect } from "bun:test";
import { interpret } from ".";

test("interpret empty string returns 0", () => {
  expect(interpret("")).toBe(0);
});

test("interpret single digit returns that digit", () => {
  expect(interpret("5")).toBe(5);
});

test("interpret multi-digit number returns that number", () => {
  expect(interpret("42")).toBe(42);
});

test("interpret addition of two numbers", () => {
  expect(interpret("1+2")).toBe(3);
});

test("interpret subtraction of two numbers", () => {
  expect(interpret("5-2")).toBe(3);
});

test("interpret multiplication of two numbers", () => {
  expect(interpret("3*4")).toBe(12);
});

test("interpret division of two numbers", () => {
  expect(interpret("8/2")).toBe(4);
});

test("interpret division truncates to integer", () => {
  expect(interpret("5/3")).toBe(1);
});

test("interpret respects operator precedence", () => {
  expect(interpret("1+2*3")).toBe(7);
});

test("interpret handles whitespace around operators", () => {
  expect(interpret("1 + 2")).toBe(3);
});

test("interpret handles parentheses", () => {
  expect(interpret("(1+2)*3")).toBe(9);
});

test("interpret handles nested parentheses", () => {
  expect(interpret("((1+2)*3)")).toBe(9);
});

test("interpret handles unary minus", () => {
  expect(interpret("-5")).toBe(-5);
});

test("interpret handles curly brace grouping", () => {
  expect(interpret("{ 2 + 3 } * 4")).toBe(20);
});

test("interpret rejects mismatched grouping delimiters", () => {
  expect(() => interpret("(1 + 2 }")).toThrow();
});

test("interpret supports let bindings in a block", () => {
  expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test("interpret throws on undefined variable", () => {
  expect(() => interpret("{ x }")).toThrow();
});

test("interpret supports multiple let bindings", () => {
  expect(interpret("{ let x = 2; let y = 3; x + y }")).toBe(5);
});

test("interpret supports nested blocks with shadowing", () => {
  expect(interpret("{ let x = 1; { let x = 2; x } + x }")).toBe(3);
});

test("interpret supports top-level let bindings", () => {
  expect(interpret("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test("interpret supports mutable bindings and assignment", () => {
  expect(interpret("let mut x = 0; x = 1; x")).toBe(1);
});

test("interpret rejects assignment to immutable binding", () => {
  expect(() => interpret("let x = 1; x = 2")).toThrow();
});

test("interpret supports assignment to mutable binding in nested scope", () => {
  expect(interpret("let mut x = 0; { x = 5; } x")).toBe(5);
});

test("interpret supports shadowing with assignment to inner binding", () => {
  expect(interpret("let mut x = 1; { let mut x = 2; x = 3; } x")).toBe(1);
});

test("interpret supports compound assignment", () => {
  expect(interpret("let mut x = 2; x += 3; x")).toBe(5);
});

test("interpret rejects compound assignment to immutable binding", () => {
  expect(() => interpret("let x = 2; x += 3")).toThrow();
});

test("interpret supports comparison operators", () => {
  expect(interpret("1 < 2")).toBe(1);
});

test("interpret supports boolean literals", () => {
  expect(interpret("let x = true; x")).toBe(1);
});

test("interpret supports if expressions", () => {
  expect(interpret("if (1 < 2) { 10 } else { 20 }")).toBe(10);
});

test("interpret throws when if without else has false condition", () => {
  expect(() => interpret("if (1 > 2) { 10 }")).toThrow();
});

test("interpret always returns a number exit code", () => {
  expect(interpret("let x = 1 < 2; x")).toBe(1);
});

test("interpret returns 0 for false exit code", () => {
  expect(interpret("let x = 2 < 1; x")).toBe(0);
});

test("interpret supports while loops", () => {
  expect(interpret("let mut i = 0; while (i < 3) { i += 1; } i")).toBe(3);
});

test("interpret supports while loop that never runs", () => {
  expect(interpret("let mut i = 0; while (i > 5) { i += 1; } i")).toBe(0);
});

test("interpret supports nested while loops", () => {
  expect(interpret("let mut i = 0; let mut j = 0; while (i < 2) { while (j < 2) { j += 1; } i += 1; } j")).toBe(2);
});

test("interpret supports U8 integer suffix", () => {
  expect(interpret("100U8")).toBe(100);
});

test("interpret supports U8 suffix in arithmetic", () => {
  expect(interpret("100U8 + 20U8")).toBe(120);
});

test("interpret throws on U8 overflow", () => {
  expect(() => interpret("255U8 + 1U8")).toThrow();
});

test("interpret throws on U8 underflow", () => {
  expect(() => interpret("0U8 - 1U8")).toThrow();
});

test("interpret rejects type mismatch in let annotation", () => {
  expect(() => interpret("let x : U8 = 0U16;")).toThrow();
});

test("interpret accepts matching type annotation", () => {
  expect(interpret("let x : U8 = 5U8; x")).toBe(5);
});