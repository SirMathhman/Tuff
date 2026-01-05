import { jest } from "@jest/globals";
import { DiagnosticReporter } from "../../main/ts/common/diagnostics";
import {
  compileSource,
  computeExitCode,
  getTypeScriptOutputPath,
} from "../../main/ts/compiler/compile";

describe("Stage 0 compiler pipeline", () => {
  let reporter: DiagnosticReporter;

  beforeEach(() => {
    reporter = new DiagnosticReporter();
    jest.spyOn(reporter, "report");
  });

  it("should compile valid source into a Program", () => {
    const source = `
      let x: I32 = 100;
      x
    `;

    const program = compileSource(source, "test.tuff", reporter);

    expect(reporter.report).not.toHaveBeenCalled();
    expect(program.kind).toBe("Program");
    expect(program.statements.length).toBe(2);
  });

  it("should report diagnostics for invalid source", () => {
    const source = `
      let x: I32 = ;
    `;

    compileSource(source, "test.tuff", reporter);

    expect(reporter.report).toHaveBeenCalled();
    expect(reporter.hasErrors()).toBe(true);
  });

  it("should compute exit code from last top-level literal", () => {
    const source = `
      7
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    expect(computeExitCode(program)).toBe(7);
  });

  it("should default exit code to 0 if last expression isn't a numeric literal", () => {
    const source = `
      let x: I32 = 1;
      x
    `;

    const program = compileSource(source, "test.tuff", reporter);
    expect(reporter.report).not.toHaveBeenCalled();

    expect(computeExitCode(program)).toBe(0);
  });

  it("should compute a .ts output path from input path", () => {
    expect(getTypeScriptOutputPath("C:/x/main.tuff")).toBe("C:/x/main.ts");
    expect(getTypeScriptOutputPath("C:/x/main.TUFF")).toBe("C:/x/main.ts");
    expect(getTypeScriptOutputPath("C:/x/main")).toBe("C:/x/main.ts");
  });
});
