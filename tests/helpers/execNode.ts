import { execFileSync, spawnSync } from "child_process";

export interface ExecResult {
  status?: number;
  stdout: string;
  stderr: string;
}

function buildWrapperScript(compiledJs: string, body: string): string {
  // Unit tests must not depend on the filesystem, so we do NOT read from disk.
  // If an arg is passed, treat it as the input content string.
  return `const compiled = ${compiledJs};
// With node -e, the first user argument is process.argv[1].
const input = (process.argv.length > 1) ? process.argv[1] : undefined;
${body}`;
}

export function runJsAndCaptureStdout(
  compiledJs: string,
  args: string[] = []
): string {
  const script = buildWrapperScript(
    compiledJs,
    "const out = (typeof compiled === 'function') ? compiled(input) : compiled;\nconsole.log(out);"
  );
  const stdout = execFileSync(process.execPath, ["-e", script, ...args], {
    encoding: "utf8",
  });
  return stdout;
}

export function runJsAndGetExitCode(
  compiledJs: string,
  args: string[] = []
): ExecResult {
  const script = buildWrapperScript(
    compiledJs,
    "const out = (typeof compiled === 'function') ? compiled(input) : compiled;\n// ensure numeric exit code\nconst code = Number(out) || 0;\nprocess.exit(code);"
  );
  const res = spawnSync(process.execPath, ["-e", script, ...args], {
    encoding: "utf8",
  });
  return {
    status: res.status ?? undefined,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}
