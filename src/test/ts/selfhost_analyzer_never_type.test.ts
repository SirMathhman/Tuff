import { describe, expect, test } from "vitest";

import { lintCode } from "./compiler_api_wrapper";

describe("selfhost analyzer: Never type", () => {
  test("accepts I32 function with panic branch (Never absorption in if)", async () => {
    const entryCode = `extern from rt::stdlib use { panic };

fn helper(ok: Bool) : I32 => {
  if (!ok) { panic("error"); }
  42
}

fn main() : I32 => helper(true)
`;

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });

  test("accepts Never type annotation on user-defined function", async () => {
    const entryCode = `extern from rt::stdlib use { panic };

fn my_panic(msg: String) : Never => panic(msg)

fn helper(ok: Bool) : I32 => {
  if (!ok) { my_panic("failed"); }
  100
}

fn main() : I32 => helper(true)
`;

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });

  test("Never absorption in if expression branches", async () => {
    const entryCode = `extern from rt::stdlib use { panic };

fn get_value(opt: Bool) : I32 => {
  // then branch is Never, else branch is I32 => result is I32
  let x = if (!opt) { panic("no value"); } else { 123 };
  x
}

fn main() : I32 => get_value(true)
`;

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });

  test("Never absorption in match expression arms", async () => {
    const entryCode = `extern from rt::stdlib use { panic };

type MyOption<T> = Some<T> | None;

fn unwrap(opt: MyOption<I32>) : I32 => {
  if (opt.tag == "Some") {
    opt.value
  } else {
    panic("unwrap on None")
  }
}

fn main() : I32 => unwrap(Some(42))
`;

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });

  test("block ending in panic satisfies any return type", async () => {
    const entryCode = `extern from rt::stdlib use { panic };

fn fail_with_string() : String => {
  panic("always fails")
}

fn fail_with_i32() : I32 => {
  panic("always fails")
}

fn main() : I32 => 0
`;

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });
});
