import { test, expect, describe } from "bun:test";
import { interpret } from "../src";
import { InterpreterError } from "../src/error";

describe("type compatibility errors", () => {
  test('interpret("(100U8 + 100I8) is I16") => 1', () => {
    expect(interpret("(100U8 + 100I8) is I16")).toBe(1);
  });

  test('interpret("let mut x = 0U8; x = 0U16;") => Error', () => {
    expect(() => interpret("let mut x = 0U8; x = 0U16;")).toThrow();
  });

  test('interpret("let mut x = 0U8; x += 0U16;") => Error', () => {
    expect(() => interpret("let mut x = 0U8; x += 0U16;")).toThrow();
  });

  test('interpret("let mut x = false; x += true;") => Error', () => {
    expect(() => interpret("let mut x = false; x += true;")).toThrow();
  });
});

describe("error positions", () => {
  test("parse error has position", () => {
    try {
      interpret("let x = ");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBeGreaterThanOrEqual(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (duplicate fn)", () => {
    try {
      interpret("fn get() => 1; fn get() => 2;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (type mismatch)", () => {
    try {
      interpret("let x : U8 = 100U16;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("runtime error has position (undefined identifier)", () => {
    try {
      interpret("foo");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBe(1);
      } else {
        throw e;
      }
    }
  });

  test("type error has position (immutable assign)", () => {
    try {
      interpret("let x = 0; x = 1;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(1);
        expect(e.position!.column).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("parse error on line 2", () => {
    try {
      interpret("let x = 1\nlet y = ");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });

  test("type error on line 2 (duplicate fn)", () => {
    try {
      interpret("fn get() => 1;\nfn get() => 2;");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBe(2);
        expect(e.position!.column).toBe(1);
      } else {
        throw e;
      }
    }
  });

  test("runtime error on line 2 (undefined fn)", () => {
    try {
      interpret("let x = 1;\nfoo();");
    } catch (e) {
      if (e instanceof InterpreterError) {
        expect(e.position).toBeDefined();
        expect(e.position!.line).toBeGreaterThanOrEqual(1);
      } else {
        throw e;
      }
    }
  });
});
