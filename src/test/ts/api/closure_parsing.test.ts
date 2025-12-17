import { describe, expect, test } from "vitest";
import { prebuiltSelfhostUrl } from "./test_utils";

describe("unified function/lambda parsing", () => {
  test("fn with single expression requires semicolon", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Single expression function MUST end with semicolon
    const goodSrc = `out fn run() => { fn get() : I32 => 100; get() }`;
    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("export function run");

    // Without semicolon, should fail
    const badSrc = `out fn run() => { fn get() : I32 => 100 get() }`;
    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }
    expect(msg).toContain("expected ';'");
  });

  test("fn with block body does not require semicolon", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Block body function does NOT require semicolon
    const goodSrc = `out fn run() => { fn get() : I32 => { 100 } get() }`;
    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("export function run");

    // With semicolon is also OK (optional)
    const alsoGoodSrc = `out fn run() => { fn get() : I32 => { 100 }; get() }`;
    const result2 = stage1lib.compile_tiny(alsoGoodSrc);
    expect(result2).toContain("export function run");
  });

  test("lambda does not require semicolon", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Lambda in call doesn't require semicolon
    const goodSrc = `
      fn apply(f: (I32) => I32, x: I32) : I32 => f(x);
      out fn run() : I32 => apply((x: I32) => x + 1, 10)
    `;
    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("export function run");
  });

  test("lambda and fn use identical param parsing", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Both should support trailing comma in params
    const src = `
      fn add(a: I32, b: I32,) : I32 => a + b;
      out fn run() : I32 => {
        let f = (x: I32, y: I32,) => x + y;
        add(1, 2) + f(3, 4)
      }
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
  });

  test("fn and lambda support same body syntax", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Both should support both single expression and block body
    const src = `
      fn single_expr() : I32 => 42;
      fn block_body() : I32 => { let x = 1; x + 41 }
      out fn run() : I32 => {
        let f1 = (x: I32) => x * 2;
        let f2 = (x: I32) => { let y = x; y * 2 };
        single_expr() + block_body() + f1(1) + f2(1)
      }
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
  });
});

describe("type parameter scope inheritance", () => {
  // NOTE: Full type parameter scope inheritance (nested fn accessing outer type params)
  // is a future feature requiring deeper architectural changes to the analyzer.
  // These tests document the expected behavior once implemented.

  test.skip("nested fn can access outer type parameter (future)", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Inner function should have access to outer function's type parameter T
    const src = `
      fn outer<T>(value: T) : T => {
        fn inner() : T => value;
        inner()
      }
      out fn run() : I32 => outer<I32>(42)
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
    expect(result).toContain("function outer");
  });

  test.skip("class fn nested fn can access class type parameter (future)", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Inner function in class fn should access class type parameter T
    const src = `
      class fn Wrapper<T>(value: T) => {
        fn get() : T => value;
      }
      out fn run() : I32 => {
        let w = Wrapper<I32>(42);
        w.get()
      }
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
    expect(result).toContain("Wrapper");
  });

  test.skip("lambda can use outer type parameter (future)", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Lambda should have access to enclosing function's type parameter
    const src = `
      fn outer<T>(value: T) : T => {
        let f = () : T => value;
        f()
      }
      out fn run() : I32 => outer<I32>(42)
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
  });

  test.skip("deeply nested functions inherit type parameters (future)", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Multiple levels of nesting should all have access to outer type params
    const src = `
      fn outer<T>(value: T) : T => {
        fn middle() : T => {
          fn inner() : T => value;
          inner()
        }
        middle()
      }
      out fn run() : I32 => outer<I32>(42)
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
  });

  test("inner fn can declare its own independent type parameter", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Inner function declares its own T, which is independent of outer T
    // This should work without requiring outer type param inheritance
    const src = `
      fn outer<T>(value: T) : T => {
        fn inner<U>(x: U) : U => x;
        inner<I32>(42);
        value
      }
      out fn run() : I32 => outer<I32>(10)
    `;
    const result = stage1lib.compile_tiny(src);
    expect(result).toContain("export function run");
  });
});
