import { jest } from "@jest/globals";
import { DiagnosticReporter } from "../../main/ts/common/diagnostics";
import { compileSource } from "../../main/ts/compiler/compile";
import { emitTypeScript } from "../../main/ts/compiler/emit_ts";

describe("TypeScript emitter", () => {
  let reporter: DiagnosticReporter;

  beforeEach(() => {
    reporter = new DiagnosticReporter();
    jest.spyOn(reporter, "report");
  });

  it("should emit imports, exports, and basic declarations", () => {
    const source = `
      from System::IO use { println };
      out let x: I32 = 10;
      fn add(a: I32, b: I32): I32 => a + b;
      struct Point { x: I32, y: I32 }
      type Num = I32 | F64;
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    const ts = emitTypeScript(program);

    expect(ts).toContain('import { println } from "System/IO";');
    expect(ts).toContain("export const x: number = 10;");
    expect(ts).toContain("function add(a: number, b: number): number");
    expect(ts).toContain("export type Point = {");
    expect(ts).toContain("x: number;");
    expect(ts).toContain("y: number;");
    expect(ts).toContain("export type Num = number | number;");
  });

  it("should emit block expressions using an IIFE with returns", () => {
    const source = `
      fn f(): I32 => {
        let y: I32 = 2;
        yield y + 1;
      }
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    const ts = emitTypeScript(program);

    // Should lower block expression to (() => { ... return ...; })()
    expect(ts).toContain("return (() => {");
    expect(ts).toContain("const y: number = 2;");
    expect(ts).toContain("return y + 1;");
    expect(ts).toContain("})();");
  });

  it("should emit slices using Array.prototype.slice", () => {
    const source = `
      let a: [I32; 0; 10] = [1, 2, 3];
      let b: *[I32] = a[0..2];
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    const ts = emitTypeScript(program);
    expect(ts).toContain("const b: Array<number> = a.slice(0, 2);");
  });
});
