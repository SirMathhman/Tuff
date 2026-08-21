import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});

test('evaluate("") => 0', () => {
  const r = evaluate("");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("1") => 1', () => {
  const r = evaluate("1");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("1 + 2") => 3', () => {
  const r = evaluate("1 + 2");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(3);
});

test('evaluate("1 + 2 + 3") => 6', () => {
  const r = evaluate("1 + 2 + 3");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(6);
});

test('evaluate("2 + 3 - 4") => 1', () => {
  const r = evaluate("2 + 3 - 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("2 * 3 + 4") => 10', () => {
  const r = evaluate("2 * 3 + 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(10);
});

test('evaluate("2 + 3 * 4") => 14', () => {
  const r = evaluate("2 + 3 * 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(14);
});

test('evaluate("(2 + 3) * 4") => 20', () => {
  const r = evaluate("(2 + 3) * 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(20);
});

test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  const r = evaluate("{ 2 + 3 } * 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(20);
});

test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  const r = evaluate("{ let x = 2 + 3; x } * 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(20);
});

test('evaluate("{ let x = 2; let y = x + 3; y } * 4") => 20', () => {
  const r = evaluate("{ let x = 2; let y = x + 3; y } * 4");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(20);
});

test('evaluate("let z = { let x = 2; let y = x + 3; y } * 4; z") => 20', () => {
  const r = evaluate("let z = { let x = 2; let y = x + 3; y } * 4; z");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(20);
});

test('evaluate("let x = 100;") => 0', () => {
  const r = evaluate("let x = 100;");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("let mut x = 1; x") => 1', () => {
  const r = evaluate("let mut x = 1; x");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  const r = evaluate("let mut x = 0; x = 1; x");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("10 / 3") => 3', () => {
  const r = evaluate("10 / 3");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(3);
});

test('evaluate("10 / 3 / 2") => 1', () => {
  const r = evaluate("10 / 3 / 2");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

function expectInvalidInput(input: string) {
  const r = evaluate(input);
  if (r.ok) throw new Error(`expected error, got ok: ${r.value}`);
  if (r.error.kind !== "invalid_input")
    throw new Error(
      `expected kind "invalid_input", got: ${JSON.stringify(r.error)}`,
    );
}

test('evaluate("abc") => invalid_input error', () => {
  expectInvalidInput("abc");
});

test('evaluate("undefinedIdentifier") => invalid_input error', () => {
  expectInvalidInput("undefinedIdentifier");
});

test('evaluate("let y = { let x = 0; x }; x") => invalid_input error', () => {
  expectInvalidInput("let y = { let x = 0; x }; x");
});

test('evaluate("let x = true; x") => 1', () => {
  const r = evaluate("let x = true; x");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("let x = false; x") => 0', () => {
  const r = evaluate("let x = false; x");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("let x = 1; let y = 2; x == y") => 0', () => {
  const r = evaluate("let x = 1; let y = 2; x == y");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("true == 1") => 0', () => {
  const r = evaluate("true == 1");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("1 == 1 == true") => 1', () => {
  const r = evaluate("1 == 1 == true");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

function expectDivisionByZero(input: string) {
  const r = evaluate(input);
  if (r.ok) throw new Error(`expected error, got ok: ${r.value}`);
  if (r.error.kind !== "division_by_zero")
    throw new Error(
      `expected kind "division_by_zero", got: ${JSON.stringify(r.error)}`,
    );
}

test('evaluate("1 / 0") => division_by_zero error', () => {
  expectDivisionByZero("1 / 0");
});

test('evaluate("0 / 0") => division_by_zero error', () => {
  expectDivisionByZero("0 / 0");
});

test('evaluate("10 / (1 - 1)") => division_by_zero error', () => {
  expectDivisionByZero("10 / (1 - 1)");
});
