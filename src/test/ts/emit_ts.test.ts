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
    expect(ts).toContain("export interface Point {");
    expect(ts).toContain("x: number;");
    expect(ts).toContain("y: number;");
    expect(ts).toContain("export type Num = number | number;");
  });

  it("should emit impl blocks as namespaces with exported functions", () => {
    const source = `
      struct Point { x: I32, y: I32 }
      impl Point {
        fn new(x: I32, y: I32): Point => {
          yield Point { x, y };
        }
      }
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    const ts = emitTypeScript(program);

    expect(ts).toContain("export namespace Point {");
    // `new` is a reserved word in TS, so we should mangle it.
    expect(ts).toContain("export function new_(x: number, y: number): Point");
    expect(ts).toContain("return (() => {");
    expect(ts).toContain("return ({ x: x, y: y } as Point);");
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

  it("should emit `is` checks for primitive types", () => {
    const source = `
      fn isBool(x: I32 | Bool): Bool => x is Bool;
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    const ts = emitTypeScript(program);

    expect(ts).toContain("const __is0 = x;");
    expect(ts).toContain('typeof __is0 === "boolean"');
  });
});
