import { describe, expect, test } from "vitest";

import {
  compileCode,
  importEsmFromSource,
  lintCode,
} from "./compiler_api_wrapper";

async function expectLintOk(entryCode: string) {
  const r = await lintCode(entryCode, {});
  expect(r.diagnostics ?? "").toBe("");
  expect(r.success).toBe(true);
  expect((r.errors ?? []).length).toBe(0);
  return r;
}

async function expectLintErr(entryCode: string, re: RegExp) {
  const r = await lintCode(entryCode, {});
  expect(r.diagnostics ?? "").toBe("");
  expect(r.success).toBe(false);
  expect((r.errors ?? []).some((e) => re.test(e.msg))).toBe(true);
  return r;
}

async function expectRunMain(entryCode: string, expected: unknown) {
  const r = await compileCode(entryCode, {});
  expect(r.diagnostics ?? "").toBe("");
  expect(r.success).toBe(true);
  expect(typeof r.entryJs).toBe("string");

  const mod = await importEsmFromSource(r.entryJs as string);
  expect(mod.main()).toBe(expected);
}

describe("selfhost analyzer (phase 4 completion)", () => {
  test("generic type resolution enforces type args and returns", async () => {
    // --- OK: inference from args ---
    await expectRunMain(
      [
        "fn id<T>(x: T) : T => x",
        "fn main() : I32 => {",
        "  let a: I32 = id(1);",
        "  a",
        "}",
        "",
      ].join("\n"),
      1
    );

    // --- Error: explicit type args contradict actual argument ---
    await expectLintErr(
      [
        "fn id<T>(x: T) : T => x",
        "fn main() : I32 => {",
        "  let a: I32 = id<Bool>(1);",
        "  a",
        "}",
        "",
      ].join("\n"),
      /id|generic|Bool|I32|type/i
    );

    // --- Error: return type derived from specialization must match context ---
    await expectLintErr(
      [
        "fn id<T>(x: T) : T => x",
        "fn main() : I32 => {",
        "  let b: Bool = id<I32>(1);",
        "  if (b) { 1 } else { 0 }",
        "}",
        "",
      ].join("\n"),
      /return|let\s+b|Bool|I32|type/i
    );
  });

  test("union type narrowing gates payload field access", async () => {
    // --- Error: accessing .value without narrowing ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = None;",
        "  o.value",
        "}",
        "",
      ].join("\n"),
      /Option|Some|None|value|narrow|type/i
    );

    // --- OK: tag check narrows to payload variant ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        '  if (o.tag == "Some") { o.value } else { 0 }',
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- Error: else branch is narrowed away from payload variant ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        '  if (o.tag == "Some") { 0 } else { o.value }',
        "}",
        "",
      ].join("\n"),
      /value|Some|None|narrow|type/i
    );

    // --- OK: `is` check narrows to payload variant ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is Some) { o.value } else { 0 }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- Error: else branch is NOT narrowed to payload variant (using `is`) ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is Some) { 0 } else { o.value }",
        "}",
        "",
      ].join("\n"),
      /value|Some|None|narrow|type/i
    );

    // --- OK: module-qualified variant name in `is` (uses last path segment) ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "module M { }",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is M::Some) { o.value } else { 0 }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- OK: swapped operand order also narrows ("Some" == o.tag) ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        '  if ("Some" == o.tag) { o.value } else { 0 }',
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- OK: `!=` narrows the else branch to the payload variant ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        '  if (o.tag != "Some") { 0 } else { o.value }',
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- OK: negation of `is` narrows else branch (if (!(o is Some)) ...) ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (!(o is Some)) { 0 } else { o.value }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- OK: `is not` sugar works and narrows else branch ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is not Some) { 0 } else { o.value }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- Error: `is` RHS must be a valid variant of the union ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is NotARealVariant) { 1 } else { 0 }",
        "}",
        "",
      ].join("\n"),
      /Option|variant|NotARealVariant|Some|None/i
    );

    // --- OK: payload type is inferred after narrowing (Option<I32>.value is I32) ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is Some) {",
        "    let x: I32 = o.value;",
        "    x",
        "  } else {",
        "    0",
        "  }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- Error: payload type mismatch after narrowing (Option<I32>.value is not String) ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  if (o is Some) {",
        "    let x: String = o.value;",
        "    0",
        "  } else {",
        "    0",
        "  }",
        "}",
        "",
      ].join("\n"),
      /String|I32|value|type/i
    );
  });

  test("match exhaustiveness-lite for union variants", async () => {
    // --- OK: all variants covered without '_' ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = Some(3);",
        "  match (o) {",
        "    Some => o.value,",
        "    None => 0",
        "  }",
        "}",
        "",
      ].join("\n"),
      3
    );

    // --- OK: '_' wildcard allowed ---
    await expectRunMain(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = None;",
        "  match (o) {",
        "    Some => 1,",
        "    _ => 0",
        "  }",
        "}",
        "",
      ].join("\n"),
      0
    );

    // --- Error: missing variants and no '_' ---
    await expectLintErr(
      [
        "type Option<T> = Some<T> | None;",
        "fn main() : I32 => {",
        "  let o: Option<I32> = None;",
        "  match (o) {",
        "    Some => 1",
        "  }",
        "}",
        "",
      ].join("\n"),
      /match|exhaust|None|Some|Option|_/i
    );
  });

  test("array initialization tracking enforces read/write safety", async () => {
    // --- Error: read beyond initialized prefix ---
    await expectLintErr(
      [
        "fn main() : I32 => {",
        "  let buf: [U8; 2; 5] = [10, 20];",
        "  buf[2]",
        "}",
        "",
      ].join("\n"),
      /uninit|initialized|array|index/i
    );

    // --- Error: cannot skip initialization (write past next slot) ---
    await expectLintErr(
      [
        "fn main() : I32 => {",
        "  let mut buf: [U8; 2; 5] = [10, 20];",
        "  buf[4] = 77;",
        "  0",
        "}",
        "",
      ].join("\n"),
      /skip|initialized|array|index/i
    );

    // --- OK: writing the next index increases initialized and allows read ---
    await expectRunMain(
      [
        "fn main() : I32 => {",
        "  let mut buf: [U8; 2; 5] = [10, 20];",
        "  buf[2] = 30;",
        "  buf[2]",
        "}",
        "",
      ].join("\n"),
      30
    );

    // --- Error: bounds check on literal index ---
    await expectLintErr(
      [
        "fn main() : I32 => {",
        "  let mut buf: [U8; 2; 5] = [10, 20];",
        "  buf[5] = 1;",
        "  0",
        "}",
        "",
      ].join("\n"),
      /bounds|out of bounds|index|array/i
    );
  });
});
