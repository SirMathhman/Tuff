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