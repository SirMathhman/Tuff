import { describe, expect, test } from "vitest";

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

function captureStdout(run: () => number): { rc: number; out: string } {
  let buf = "";
  const origWrite = process.stdout.write.bind(process.stdout);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, encoding?: any, cb?: any) => {
    buf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (typeof cb === "function") cb();
    return true;
  };

  try {
    const rc = run();
    return { rc, out: buf };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = origWrite;
  }
}

describe("generated expr parser (EBNF -> Tuff)", () => {
  test("can generate, compile, and match handwritten AST for arithmetic", async () => {
    const outDir = resolve(
      ".dist",
      "generated-expr-parser",
      `case-${Date.now().toString()}-${process.pid.toString()}-${Math.floor(
        Math.random() * 1_000_000_000
      ).toString()}`
    );
    await mkdir(outDir, { recursive: true });

    // Stage prebuilt compiler + std + compiler/tools sources (for gen script imports).
    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(outDir, {
      includeStd: true,
      includeCompilerSources: true,
    });

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof (tuffc as any).main).toBe("function");

    // Copy grammar + generator tool into the staged directory so relative paths work.
    const stagedGrammar = resolve(outDir, "grammars", "tuff_expr_min.ebnf");
    await mkdir(dirname(stagedGrammar), { recursive: true });
    await copyFile(resolve("grammars", "tuff_expr_min.ebnf"), stagedGrammar);

    // IMPORTANT: `src::...` module paths are resolved relative to the file.
    // So this file must live in a directory that already contains `src/`.
    const stagedGenTool = resolve(outDir, "gen_tuff_expr_parser.tuff");
    await copyFile(resolve("tools", "gen_tuff_expr_parser.tuff"), stagedGenTool);

    const genToolOut = resolve(outDir, "gen_tuff_expr_parser.mjs");
    {
      const rc = (tuffc as any).main([stagedGenTool, genToolOut]);
      expect(rc).toBe(0);
    }

    // Run tool to capture generated parser source.
    const genTool = await import(pathToFileURL(genToolOut).toString() + `?v=${Date.now()}`);
    const { rc: rcRun, out } = captureStdout(() => (genTool as any).main());
    expect(rcRun).toBe(0);

    const marker = "// Generated AST Parser";
    const idx = out.indexOf(marker);
    expect(idx).toBeGreaterThanOrEqual(0);
    // Extract the generated module source and add a tiny main so we can compile
    // it with the single-file CLI path used by tests.
    const parserSrc =
      out.slice(idx) +
      "\n\n// Test harness entrypoint (not used by compiler)\nfn main() : I32 => 0\n";

    // Write generated parser next to compiler parsing sources so `from ast use` resolves.
    const genParserTuff = resolve(
      outDir,
      "src",
      "main",
      "tuff",
      "compiler",
      "parsing",
      "generated_expr_from_ebnf.tuff"
    );
    await mkdir(dirname(genParserTuff), { recursive: true });
    await writeFile(genParserTuff, parserSrc, "utf8");

    const genParserMjs = genParserTuff.replace(/\.tuff$/, ".mjs");
    {
      const rc = (tuffc as any).main([genParserTuff, genParserMjs]);
      expect(rc).toBe(0);
    }

    // Import handwritten parser + emitter from prebuilt.
    const handwritten = await import(
      pathToFileURL(resolve(outDir, "parsing", "expr_stmt.mjs")).toString() + `?v=${Date.now()}`
    );
    const emitter = await import(
      pathToFileURL(resolve(outDir, "emit", "ast_js.mjs")).toString() + `?v=${Date.now()}`
    );

    expect(typeof (handwritten as any).parse_expr_ast).toBe("function");
    expect(typeof (emitter as any).emit_expr_js).toBe("function");

    // Import generated parser.
    const generated = await import(pathToFileURL(genParserMjs).toString() + `?v=${Date.now()}`);
    expect(typeof (generated as any).parse_expr).toBe("function");

    const cases = [
      "1",
      "42",
      "1+2",
      "1+2*3",
      "(1+2)*3",
      "-5",
      "10-3*2",
      "!(1)" // just to ensure unary ! parses
    ];

    for (const src of cases) {
      const h = (handwritten as any).parse_expr_ast(src, 0);
      expect(h).toBeTruthy();
      const hJs = (emitter as any).emit_expr_js(h.expr);

      const g = (generated as any).parse_expr(src, 0);
      expect(g.success, `generated parse failed: ${src} :: ${g.error}`).toBe(true);
      const gJs = (emitter as any).emit_expr_js(g.expr);

      expect(gJs, `mismatch for ${src}`).toBe(hJs);
    }
  });
});
