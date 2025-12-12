import { describe, expect, test } from "bun:test";
import { Diagnostics } from "../src/diagnostics";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";

function parse(src: string) {
  const diags = new Diagnostics();
  const toks = new Lexer("/virtual/test.tuff", src).tokenize();
  const program = new Parser("/virtual/test.tuff", toks, diags).parseProgram();
  return { diags, program };
}

describe("parser", () => {
  test("block expression tail is last expr without semicolon", () => {
    const { program } = parse(`let x = { let y = 100; y }`);
    const letX: any = (program as any).items[0];
    expect(letX.kind).toBe("LetDecl");
    expect(letX.init.kind).toBe("BlockExpr");
    expect(letX.init.tail.kind).toBe("IdentExpr");
    expect(letX.init.tail.name).toBe("y");
  });

  test("block expression without tail when semicolon terminates", () => {
    const { program } = parse(`let x = { let y = 100; y; }`);
    const letX: any = (program as any).items[0];
    expect(letX.init.kind).toBe("BlockExpr");
    expect(letX.init.tail).toBeUndefined();
  });

  test("if expression requires else (parse-time)", () => {
    const { diags } = parse(`let x = if (true) 1`);
    expect(diags.hasErrors).toBe(true);
  });

  test("match parses arms", () => {
    const { program } = parse(`let x = match (None) { None => 0, _ => 1 }`);
    const letX: any = (program as any).items[0];
    expect(letX.init.kind).toBe("MatchExpr");
    expect(letX.init.arms.length).toBe(2);
  });
});
