import fs from "fs";
import path from "path";
import { compileImpl } from "../src/compiler/compile";
import { runJsAndCaptureStdout, runJsAndGetExitCode } from "./helpers/execNode";

describe("self-hosting initial", () => {
  test("compiled compiler echoes file", () => {
    const tuffPath = path.join(
      __dirname,
      "..",
      "self_hosting",
      "compiler.tuff"
    );
    const samplePath = path.join(
      __dirname,
      "..",
      "self_hosting",
      "sample.tuff"
    );
    const tuffSrc = fs.readFileSync(tuffPath, "utf8");
    const compiled = compileImpl(tuffSrc);
    expect(typeof compiled).toBe("string");

    const stdout = runJsAndCaptureStdout(compiled, [samplePath]).trim();
    const expected = fs.readFileSync(samplePath, "utf8").trim();
    expect(stdout).toBe(expected);
  });

  test("compiled compiler exits with code 64 for a bare '64' program", () => {
    const tuffPath = path.join(__dirname, "..", "self_hosting", "exit64.tuff");
    const tuffSrc = fs.readFileSync(tuffPath, "utf8");
    const compiled = compileImpl(tuffSrc);
    expect(typeof compiled).toBe("string");

    const res = runJsAndGetExitCode(compiled);
    expect(res.status).toBe(64);
  });
});
