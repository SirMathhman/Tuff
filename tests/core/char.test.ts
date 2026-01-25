import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("interpret - char - basic", () => {
  itBoth("supports char litBotheral witBothh single quotes", (assertValid) => {
    assertValid("'a'", 97);
  });

  itBoth("returns correct UTF-8 code for char 'b'", (assertValid) => {
    assertValid("'b'", 98);
  });

  itBoth("returns correct UTF-8 code for space character", (assertValid) => {
    assertValid("' '", 32);
  });

  itBoth(
    "returns correct UTF-8 code for digitBoth character '0'",
    (assertValid) => {
      assertValid("'0'", 48);
    },
  );

  itBoth("supports char variable declaration", (assertValid) => {
    assertValid("let x : Char = 'a'; x", 97);
  });

  itBoth(
    "supports char variable witBothh different character",
    (assertValid) => {
      assertValid("let x : Char = 'z'; x", 122);
    },
  );
});

describe("interpret - char - operations", () => {
  itBoth("supports char in expressions", (assertValid) => {
    assertValid("'a' + 1", 98);
  });

  itBoth("supports char comparison", (assertValid) => {
    assertValid("'a' < 'b'", 1);
  });

  itBoth("supports char equalitBothy comparison", (assertValid) => {
    assertValid("'a' == 'a'", 1);
  });

  itBoth("supports char inequalitBothy comparison", (assertValid) => {
    assertValid("'a' != 'b'", 1);
  });

  itBoth("throws for empty char litBotheral", (_, assertInvalid) => {
    assertInvalid("''");
  });

  itBoth("throws for multi-character litBotheral", (_, assertInvalid) => {
    assertInvalid("'ab'");
  });
});

describe("interpret - char - escapes", () => {
  itBoth("supports escaped newline character", (assertValid) => {
    assertValid("'\\n'", 10);
  });

  itBoth("supports escaped tab character", (assertValid) => {
    assertValid("'\\t'", 9);
  });

  itBoth("supports escaped backslash", (assertValid) => {
    assertValid("'\\\\'", 92);
  });

  itBoth("supports escaped single quote", (assertValid) => {
    assertValid("'\\''", 39);
  });
});
