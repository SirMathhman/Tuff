import { describe, it } from "bun:test";
import { assertInterpretValid, assertInterpretInvalid } from "../test-helpers";

describe("interpret - char", () => {
  it("supports char literal with single quotes", () => {
    assertInterpretValid("'a'", 97);
  });

  it("returns correct UTF-8 code for char 'b'", () => {
    assertInterpretValid("'b'", 98);
  });

  it("returns correct UTF-8 code for space character", () => {
    assertInterpretValid("' '", 32);
  });

  it("returns correct UTF-8 code for digit character '0'", () => {
    assertInterpretValid("'0'", 48);
  });

  it("supports char variable declaration", () => {
    assertInterpretValid("let x : Char = 'a'; x", 97);
  });

  it("supports char variable with different character", () => {
    assertInterpretValid("let x : Char = 'z'; x", 122);
  });

  it("supports char in expressions", () => {
    assertInterpretValid("'a' + 1", 98);
  });

  it("supports char comparison", () => {
    assertInterpretValid("'a' < 'b'", 1);
  });

  it("supports char equality comparison", () => {
    assertInterpretValid("'a' == 'a'", 1);
  });

  it("supports char inequality comparison", () => {
    assertInterpretValid("'a' != 'b'", 1);
  });

  it("throws for empty char literal", () => {
    assertInterpretInvalid("''");
  });

  it("throws for multi-character literal", () => {
    assertInterpretInvalid("'ab'");
  });

  it("supports escaped newline character", () => {
    assertInterpretValid("'\\n'", 10);
  });

  it("supports escaped tab character", () => {
    assertInterpretValid("'\\t'", 9);
  });

  it("supports escaped backslash", () => {
    assertInterpretValid("'\\\\'", 92);
  });

  it("supports escaped single quote", () => {
    assertInterpretValid("'\\''", 39);
  });
});
