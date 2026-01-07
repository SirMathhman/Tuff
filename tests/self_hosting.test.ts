import { compileImpl } from "../src/compiler/compile";
import { runJsAndCaptureStdout, runJsAndGetExitCode } from "./helpers/execNode";

describe("self-hosting initial", () => {
  test("compiled compiler echoes file", () => {
    // Unit test: no filesystem dependencies.
    const tuffSrc = "fn compile(s) => {\n  // Minimal compiler: echo input string\n  return (s);\n}\n\ncompile\n";
    const sample = "Hello from sample.tuff\n";
    const compiled = compileImpl(tuffSrc);
    expect(typeof compiled).toBe("string");

    const stdout = runJsAndCaptureStdout(compiled, [sample]).trim();
    expect(stdout).toBe(sample.trim());
  });

  test("compiled compiler exits with code 64 for a bare '64' program", () => {
    // Unit test: no filesystem dependencies.
    const tuffSrc = "let x = 64; x\n";
    const compiled = compileImpl(tuffSrc);
    expect(typeof compiled).toBe("string");

    const res = runJsAndGetExitCode(compiled);
    expect(res.status).toBe(64);
  });
});
