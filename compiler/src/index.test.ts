import { compile } from ".";
import { Ok } from "./result";
import { expect, test } from "bun:test";

function run(source: string, stdIn = "") {
  const compiledJS = compile(source);
  if (compiledJS instanceof Ok) {
    return new Function("stdIn", compiledJS.value)(stdIn);
  } else {
    expect(compiledJS.error).toBeUndefined();
  }
}

test("run(empty string) => 0", () => {
  expect(run("")).toBe(0);
});

test('run(" ") => 0', () => {
  expect(run(" ")).toBe(0);
});

test('run("read<U8>()", "100") => 100', () => {
  expect(run("read<U8>()", "100")).toBe(100);
});

test('run("read<U8>()", "100 20") => 100', () => {
  expect(run("read<U8>()", "100 20")).toBe(100);
});

test('run("read<U8>() + read<U8>()", "100 20") => 120', () => {
  expect(run("read<U8>() + read<U8>()", "100 20")).toBe(120);
});

test('run("read<U8>() + read<U8>() + read<U8>()", "100 20 1") => 121', () => {
  expect(run("read<U8>() + read<U8>() + read<U8>()", "100 20 1")).toBe(121);
});

test('run("let x : U8 = read<U8>();", "100") => 0', () => {
  expect(run("let x : U8 = read<U8>();", "100")).toBe(0);
});

test('run("let x : U8 = read<U8>(); x", "100") => 100', () => {
  expect(run("let x : U8 = read<U8>(); x", "100")).toBe(100);
});

test('run("let x = read<U8>(); x", "100") => 100', () => {
  expect(run("let x = read<U8>(); x", "100")).toBe(100);
});

test('run("read<U8>() + 10U8", "100") => 110', () => {
  expect(run("read<U8>() + 10U8", "100")).toBe(110);
});


