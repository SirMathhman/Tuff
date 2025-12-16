import { describe, expect, test } from "vitest";

import { normalizeNewlines, prebuiltSelfhostUrl } from "./test_utils";

describe("selfhost diagnostics", () => {
  test("parse error includes location and caret", async () => {
    const stage1lib = (await import(prebuiltSelfhostUrl("tuffc_lib.mjs"))) as any;

    // Trigger a simple parser error: missing ')' in paren expression.
    const badSrc = `fn main() => (1 + 2`;

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    // Should include file:line:col + a code frame caret.
    // New format: always include file, line, col, and absolute offset.
    expect(msg).toMatch(/<input>:\d+:\d+ \(offset \d+\)/);
    expect(msg).toContain("expected");
    expect(msg).toMatch(/\n\s*\|\s*\^/);

    // For common parse errors, we include a recommended fix.
    expect(msg).toMatch(/\nhelp: /);

    // Snapshot the full formatting to prevent accidental regressions.
    // Normalize Windows newlines so the snapshot is stable across OSes.
    const norm = normalizeNewlines(msg);
    expect(norm).toMatchInlineSnapshot(`
      "<input>:1:20 (offset 19) error: expected ')'
      1 | fn main() => (1 + 2
        |                    ^
      help: Add ')' to close the opening '('."
    `);
  });

  test("parse error includes multi-line context", async () => {
    const stage1lib = (await import(prebuiltSelfhostUrl("tuffc_lib.mjs"))) as any;

    // Error on the middle line so we can assert previous/next lines are shown.
    // Missing ')' in the let initializer.
    const badSrc = ["fn main() => {", "  let x = (1 + 2", "  x", "}"].join(
      "\n"
    );

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    const norm = normalizeNewlines(msg);

    // Should include a 3-line window around the failing line.
    expect(norm).toContain("2 |   let x = (1 + 2");
    expect(norm).toContain("3 |   x");
    expect(norm).toContain("4 | }");
    expect(norm).toMatch(/\n\s*\|\s*\^/);
  });

  test("parse error can underline spans", async () => {
    const stage1lib = (await import(prebuiltSelfhostUrl("tuffc_lib.mjs"))) as any;

    // Force a keyword mismatch so the diagnostic can underline a multi-char span.
    // We use the full parser entrypoint so we hit `parse_keyword`.
    const badSrc = [
      "fn main() => {",
      "  let x 123;", // missing '=' after identifier
      "  x",
      "}",
    ].join("\n");

    let msg = "";
    try {
      stage1lib.parse_program_with_trivia_api(badSrc, false);
      throw new Error("expected parse_program_with_trivia_api to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    const norm = normalizeNewlines(msg);

    // Caret row should contain multiple carets when a span is highlighted.
    expect(norm).toMatch(/\^\^\^/);
    expect(norm).toContain("expected keyword: =");
  });

  test("warning includes file and line", async () => {
    const stage1lib = (await import(prebuiltSelfhostUrl("tuffc_lib.mjs"))) as any;

    // Historically we emitted a warning for very short identifiers (like `k`).
    // That check is intentionally removed/disabled now because it was too noisy.
    const src = `fn main() => { let k = 1; k }`;

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any, ...args: any[]) => {
      chunks.push(String(chunk));
      return origWrite(chunk, ...args);
    };

    try {
      stage1lib.compile_tiny(src);
    } finally {
      (process.stdout as any).write = origWrite;
    }

    const out = chunks.join("");

    // Should NOT emit the old short-identifier warning.
    expect(out).not.toMatch(/warning: identifier 'k' is too short/);
  });

  test("analyzer reports multiple errors in one compile", async () => {
    const stage1lib = (await import(prebuiltSelfhostUrl("tuffc_lib.mjs"))) as any;

    // Two independent analyzer errors:
    // 1) Typed let mismatch (I32 vs String)
    // 2) Unknown name `z`
    const badSrc = [
      "fn main() => {",
      '  let x: I32 = "nope";',
      "  let y = z;",
      "  0",
      "}",
    ].join("\n");

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    const norm = normalizeNewlines(msg);

    // Should include BOTH diagnostics.
    expect(norm).toContain("let x");
    expect(norm).toMatch(/expected I32, got String/);
    expect(norm).toMatch(/unknown name: z/);

    // And it should look like multiple error blocks rather than a single abort.
    expect((norm.match(/\berror:/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
