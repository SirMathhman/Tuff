import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpreter";

describe("arrays and indexing", () => {
  it("supports array literals and indexing ('let x = [1,2,3]; x[0]' => 1)", () => {
    expect(interpret("let x = [1,2,3]; x[0]")).toBe(1);
    expect(interpret("let x = [1,2,3]; x[2]")).toBe(3);
    expect(() => interpret("let x = [1,2,3]; x[3]")).toThrow();
  });

  it("supports annotated arrays, index assignment and snapshot semantics", () => {
    expect(
      interpret(
        "let mut x : [I32; 0; 2]; x[0] = 100; let y : [I32; 1; 2] = x; x[0] = 200; y[0]"
      )
    ).toBe(100);

    expect(() =>
      interpret("let mut x : [I32; 0; 2]; let y : [I32; 1; 2] = x;")
    ).toThrow();

    expect(() => interpret("let x : [I32; 0; 2]; x[0] = 1;")).toThrow();
  });

  it("index assignment updates initialized count and enforces mutability", () => {
    expect(() => interpret("let x : [I32; 0; 3]; x[1]")).toThrow();
    expect(interpret("let mut x : [I32; 0; 3]; x[1] = 7; x[1]")).toBe(7);
  });

  describe("slices (*[T])", () => {
    it("bind & read via pointer", () => {
      expect(
        interpret("let arr = [1,2,3]; let mut p : *[I32]; p = &arr; p[0]")
      ).toBe(1);
    });

    it("pointer .length and .init reflect array", () => {
      expect(
        interpret("let arr = [1,2,3]; let mut p : *[I32]; p = &arr; p.length")
      ).toBe(3);
      expect(
        interpret("let arr = [1,2,3]; let mut p : *[I32]; p = &arr; p.init")
      ).toBe(3);
    });

    it("writes via pointer update original array", () => {
      expect(
        interpret(
          "let mut arr = [0,0,0]; let mut p : *[I32]; p = &arr; p[0] = 5; arr[0]"
        )
      ).toBe(5);
    });

    it("indexing checks bounds / uninitialized using pointer", () => {
      expect(() =>
        interpret(
          "let mut arr : [I32; 0; 3]; let mut p : *[I32]; p = &arr; p[1]"
        )
      ).toThrow();
    });

    it("index write via pointer updates .init", () => {
      expect(
        interpret(
          "let mut arr : [I32; 0; 3]; let mut p : *[I32]; p = &arr; p[1] = 7; p.init"
        )
      ).toBe(2);
      expect(
        interpret(
          "let mut arr : [I32; 0; 3]; let mut p : *[I32]; p = &arr; p[1] = 7; arr[1]"
        )
      ).toBe(7);
    });

    it("pointer assignment requires pointer mutability", () => {
      expect(() =>
        interpret("let arr = [1]; let p : *[I32]; p = &arr")
      ).toThrow();
      expect(
        interpret("let arr = [1]; let mut p : *[I32]; p = &arr; p[0]")
      ).toBe(1);
    });

    it("writing via pointer requires target mutability", () => {
      expect(() =>
        interpret("let arr = [1]; let mut p : *[I32]; p = &arr; p[0] = 2")
      ).toThrow();
      expect(
        interpret(
          "let mut arr = [1]; let mut p : *[I32]; p = &arr; p[0] = 2; arr[0]"
        )
      ).toBe(2);
    });

    it("deref returns array instance and supports .length/.init", () => {
      expect(
        interpret(
          "let mut arr : [I32; 0; 2]; let mut p : *[I32]; p = &arr; (*p).length"
        )
      ).toBe(2);
      expect(
        interpret(
          "let mut arr : [I32; 0; 2]; let mut p : *[I32]; p = &arr; (*p).init"
        )
      ).toBe(0);
    });

    it("using uninitialized pointer throws", () => {
      expect(() => interpret("let mut p : *[I32]; p[0]")).toThrow();
    });

    it("assign pointer to non-array throws", () => {
      expect(() =>
        interpret("let mut p : *[I32]; let x = 100; p = &x")
      ).toThrow();
    });
  });
});
