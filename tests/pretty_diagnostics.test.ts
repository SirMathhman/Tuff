import { describe, expect, test } from "bun:test";

import { compileToESM } from "../src/index";
// New pretty formatter (added in this PR)
import { formatDiagnostic } from "../src/pretty_diagnostics";

describe("pretty diagnostics", () => {
  test("includes file:line:col and a caret code frame for parser errors", () => {
    const filePath = "/virtual/parse_error.tuff";
    const source = `fn main() => { let x = (1 + 2; x }`;
    const { diagnostics } = compileToESM({ filePath, source });
    const err = diagnostics.find((d) => d.severity === "error");
    expect(err).toBeTruthy();

    const out = formatDiagnostic(err!, source);
    expect(out).toContain(`${filePath}:1:`);
    expect(out).toContain("error:");
    // Missing ')' should be called out as such (not as internal token kind name).
    expect(out).toMatch(/Expected[\s\S]*\)/);
    // A code frame caret indicator
    expect(out).toMatch(/\n\s*\|\s*\^/);
  });

  test("lexer reports unterminated string with code frame", () => {
    const filePath = "/virtual/lex_error.tuff";
    const source = `fn main() => "hello`;
    const { diagnostics } = compileToESM({ filePath, source });
    const err = diagnostics.find((d) => d.severity === "error");
    expect(err).toBeTruthy();

    const out = formatDiagnostic(err!, source);
    expect(out).toContain(`${filePath}:1:`);
    expect(out).toContain("Unterminated string");
    expect(out).toMatch(/\n\s*\|\s*\^/);
  });
});
