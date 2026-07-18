import { test, expect } from "bun:test";
import { compile } from ".";
import { act } from "react";

function expectValid(source, stdIn, expectedExitCode) {
  const generated = compile(source);

  try {
    const fn = new Function("stdIn", generated);
    const actualExitCode = fn(stdIn);
    if (expectedExitCode != actualExitCode) {
      throw new Error(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: " +
          generated,
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'");
  }
}

function expectInvalid(source) {
  expect(() => compile(source)).toThrow();
}

test("empty source", () => {
  expectValid("", "", 0);
});

test("positive integer literal", () => {
  expectValid("42", "", 42);
});

test("negative integer literal", () => {
  expectValid("-42", "", -42);
});

test("float literal", () => {
  expectValid("3.14", "", 3.14);
});

test("negative float literal", () => {
  expectValid("-3.14", "", -3.14);
});

test("U8 suffix", () => {
  expectValid("255U8", "", 255);
});

test("U8 clamping", () => {
  expectValid("300U8", "", 255);
});

test("U16 suffix", () => {
  expectValid("65535U16", "", 65535);
});

test("U32 suffix", () => {
  expectValid("4294967295U32", "", 4294967295);
});

test("I8 suffix", () => {
  expectValid("127I8", "", 127);
});

test("I8 negative", () => {
  expectValid("-128I8", "", -128);
});

test("I16 suffix", () => {
  expectValid("32767I16", "", 32767);
});

test("I32 suffix", () => {
  expectValid("2147483647I32", "", 2147483647);
});

test("F32 suffix", () => {
  expectValid("3.14F32", "", parseFloat(3.14.toPrecision(6)));
});

test("F64 suffix", () => {
  expectValid("3.14F64", "", 3.14);
});

test("multiple statements", () => {
  expectValid("10; 20; 30", "", 30);
});

test("single statement with semicolon", () => {
  expectValid("42;", "", 42);
});

test("invalid syntax throws", () => {
  expectInvalid("abc");
});

test("invalid suffix throws", () => {
  expectInvalid("42U99");
});

test("unexpected character throws", () => {
  expectInvalid("!");
});

test("minus without number throws", () => {
  expectInvalid("-");
});


