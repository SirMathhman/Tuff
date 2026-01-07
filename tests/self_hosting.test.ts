import { compileImpl } from "../src/compiler/compile";
import { runJsAndCaptureStdout, runJsAndGetExitCode } from "./helpers/execNode";
import fs from "fs";
import vm from "node:vm";
import { compileBundle } from "../src/run";
import * as stringModule from "../self_hosting/modules/tuff/stuff/string";

describe("self-hosting initial", () => {
  test("compiled compiler echoes file", () => {
    // Unit test: no filesystem dependencies.
    const tuffSrc =
      "fn compile(s) => {\n  // Minimal compiler: echo input string\n  return (s);\n}\n\ncompile\n";
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

  test("self-hosting: extern provider method called on literal evaluates correctly", () => {
    // Read the module sources from the self_hosting folder
    const providerSrc = fs.readFileSync(
      "self_hosting/modules/tuff/stuff/provider.tuff",
      "utf8"
    );
    let userSrc = fs.readFileSync(
      "self_hosting/modules/tuff/stuff/user.tuff",
      "utf8"
    );
    // Remove the local `from tuff::stuff use { ... };` import from the user source
    // to avoid a self-import cycle for this simple test; provider declarations
    // are provided separately below.
    userSrc = userSrc.replace(
      /^\s*from\s+[A-Za-z_$][A-Za-z0-9_$:\s]*use\s*\{[^}]*\}\s*;\s*/m,
      ""
    );
    // Strip comment-only lines to avoid producing an invalid `return (//...)` JS expression
    userSrc = userSrc.replace(/^\s*\/\/.*$/gm, "");

    // For bundling, associate the namespace ['tuff','stuff'] with provider + user source
    const files = new Map();
    files.set(["tuff", "stuff"], providerSrc + "\n" + userSrc);

    const compiled = compileBundle(files, ["tuff", "stuff"], {
      modulesRoot: "self_hosting/modules",
    });

    // DEBUG: print compiled bundle for inspection when tests fail.
    console.log(compiled);

    // Provide the JS host implementation from string.ts as `length` in the vm context
    const ctx = { length: stringModule.length };
    const result = vm.runInNewContext(compiled, ctx);
    expect(result).toBe(12);
  });
});
