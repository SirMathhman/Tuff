import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpreter";
import { stripAndValidateComments } from "../src/parser";
import { interpretAllWithNative } from "../src/interpreter_helpers";

describe("comments", () => {
  it("line comment trimmed", () => {
    expect(interpret("let x = 1; // comment")).toBe(0);
  });

  it("block comment in expression", () => {
    expect(interpret("let x = /* hi */ 1; x")).toBe(1);
  });

  it("multi-line block comment", () => {
    expect(interpret("let x = /*\ncomment\n*/ 2; x")).toBe(2);
  });

  it("unterminated block comment throws", () => {
    expect(() => interpret("let x = /* unclosed")).toThrow(
      "unterminated block comment"
    );
  });

  it("nested block comment throws", () => {
    expect(() => interpret("/* outer /* inner */")).toThrow(
      "nested block comment"
    );
  });

  it("comment-like in string preserved", () => {
    const scripts = {
      main: 'extern from lib use { length }; extern fn length(this : *Str) : USize; let s = "/* not a comment */"; s.length()',
    };
    const natives = {
      lib: "export function length(value) { return value.length; }",
    };
    // Verify stripAndValidateComments preserves the string contents
    const fromParser = stripAndValidateComments(scripts.main);
    const m = fromParser.match(/"([^"]*)"/);
    if (m) expect(m[1].length).toBe(19);
    expect(interpretAllWithNative(scripts, natives, "main")).toBe(19);
  });

  it("line comment at EOF works", () => {
    expect(interpret("let x = 1; // comment")).toBe(0);
  });
});
