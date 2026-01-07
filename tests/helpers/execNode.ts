import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync, spawnSync } from "child_process";

export interface ExecResult {
  status?: number;
  stdout: string;
  stderr: string;
}

function writeWrapperFile(compiledJs: string, body: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuff-"));
  const file = path.join(tmpDir, "compiled.js");
  const wrapper = `const compiled = ${compiledJs};
const fs = require('fs');
const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : undefined;
${body}`;
  fs.writeFileSync(file, wrapper, "utf8");
  return file;
}

export function runJsAndCaptureStdout(
  compiledJs: string,
  args: string[] = []
): string {
  const file = writeWrapperFile(
    compiledJs,
    "const out = (typeof compiled === 'function') ? compiled(input) : compiled;\nconsole.log(out);"
  );
  const stdout = execFileSync(process.execPath, [file, ...args], {
    encoding: "utf8",
  });
  return stdout;
}

export function runJsAndGetExitCode(
  compiledJs: string,
  args: string[] = []
): ExecResult {
  const file = writeWrapperFile(
    compiledJs,
    "const out = (typeof compiled === 'function') ? compiled(input) : compiled;\n// ensure numeric exit code\nconst code = Number(out) || 0;\nprocess.exit(code);"
  );
  const res = spawnSync(process.execPath, [file, ...args], {
    encoding: "utf8",
  });
  return {
    status: res.status ?? undefined,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}
