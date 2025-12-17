import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline";

export type CompileAndRunTuffMainOptions = {
  inputFile: string; // absolute path
  workDir: string; // absolute directory
};

export type CompileAndRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  const root = repoRootFromHere();
  await copyFile(resolve(root, "rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve(root, "rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

async function stageStdSources(outDir: string) {
  const stdDir = resolve(outDir, "std");
  await mkdir(stdDir, { recursive: true });
  const root = repoRootFromHere();
  await copyFile(
    resolve(root, "src", "main", "tuff", "std", "test.tuff"),
    resolve(stdDir, "test.tuff")
  );
  await copyFile(
    resolve(root, "src", "main", "tuff", "std", "prelude.tuff"),
    resolve(stdDir, "prelude.tuff")
  );

  // std/*.mjs import runtime as "./rt/*.mjs".
  const stdRtDir = resolve(stdDir, "rt");
  await mkdir(stdRtDir, { recursive: true });
  await copyFile(
    resolve(root, "rt/stdlib.mjs"),
    resolve(stdRtDir, "stdlib.mjs")
  );
  await copyFile(resolve(root, "rt/vec.mjs"), resolve(stdRtDir, "vec.mjs"));
}

function repoRootFromHere(): string {
  // tools/*.ts -> repo root
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function captureStdoutStderr<T>(fn: () => T): {
  value: T;
  stdout: string;
  stderr: string;
} {
  let stdout = "";
  let stderr = "";

  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  (process.stdout.write as any) = (chunk: any, ...rest: any[]) => {
    stdout += String(chunk);
    // Don't forward to the real stdout; keeps tests and CLI output tidy.
    void rest;
    return true;
  };
  (process.stderr.write as any) = (chunk: any, ...rest: any[]) => {
    stderr += String(chunk);
    void rest;
    return true;
  };

  try {
    const value = fn();
    return { value, stdout, stderr };
  } finally {
    (process.stdout.write as any) = origOut;
    (process.stderr.write as any) = origErr;
  }
}

export async function compileAndRunTuffMain(
  opts: CompileAndRunTuffMainOptions
): Promise<CompileAndRunResult> {
  const workDir = resolve(opts.workDir);
  await mkdir(workDir, { recursive: true });

  // Make the output self-contained.
  await writeRuntime(workDir);
  await stageStdSources(workDir);

  const inFile = resolve(opts.inputFile);
  const outFile = resolve(workDir, "out.mjs");

  const root = repoRootFromHere();
  const tuffcFile = resolve(root, "selfhost", "prebuilt", "tuffc.mjs");
  const tuffc = await import(pathToFileURL(tuffcFile).toString());
  if (typeof (tuffc as any).run !== "function") {
    throw new Error(`expected prebuilt compiler to export run(): ${tuffcFile}`);
  }

  const rcCompile = (tuffc as any).run([inFile, outFile]);
  if (rcCompile !== 0) {
    return { exitCode: rcCompile, stdout: "", stderr: "" };
  }

  const mod = await import(
    pathToFileURL(outFile).toString() + `?v=${Date.now()}`
  );
  if (typeof (mod as any).main !== "function") {
    throw new Error(`expected compiled module to export main(): ${outFile}`);
  }

  const {
    value: rcRun,
    stdout,
    stderr,
  } = captureStdoutStderr(() => (mod as any).main());
  return { exitCode: rcRun ?? 0, stdout, stderr };
}

function buildWrapperProgram(body: string): string {
  // Keep this minimal: provide println/print and run the user's body.
  // They can declare lets, call functions, etc.
  return [
    "extern from rt::stdlib use { print, println };",
    "fn main() : I32 => {",
    body.trimEnd(),
    "  0",
    "}",
    "",
  ].join("\n");
}

async function repl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let buffer: string[] = [];

  function help() {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Tuff REPL (minimal)",
        "  Type Tuff statements for the body of main().",
        "Commands:",
        "  :run    compile+run current buffer",
        "  :show   show current buffer",
        "  :clear  clear buffer",
        "  :quit   exit",
      ].join("\n")
    );
  }

  help();

  const prompt = () => rl.prompt();
  rl.setPrompt("> ");
  prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();

    if (trimmed === ":quit" || trimmed === ":q") {
      rl.close();
      return;
    }

    if (trimmed === ":help" || trimmed === ":h") {
      help();
      prompt();
      return;
    }

    if (trimmed === ":clear") {
      buffer = [];
      prompt();
      return;
    }

    if (trimmed === ":show") {
      // eslint-disable-next-line no-console
      console.log(buffer.join("\n"));
      prompt();
      return;
    }

    if (trimmed === ":run") {
      const workDir = resolve(
        ".dist",
        "tuff-repl",
        `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
      );
      await mkdir(workDir, { recursive: true });

      const inFile = resolve(workDir, "repl.tuff");
      const program = buildWrapperProgram(
        buffer.length ? buffer.map((l) => `  ${l}`).join("\n") + "\n" : ""
      );
      await writeFile(inFile, program, "utf8");

      const result = await compileAndRunTuffMain({
        inputFile: inFile,
        workDir,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.log(`(exit ${result.exitCode})`);
      }

      prompt();
      return;
    }

    // Default: add to buffer.
    buffer.push(line);
    prompt();
  });

  rl.on("close", () => {
    process.exitCode = 0;
  });
}

export async function main(): Promise<number> {
  await repl();
  return 0;
}

// Running via: tsx tools/tuff_repl.ts
if (
  process.argv[1] &&
  process.argv[1].replaceAll("\\\\", "/").endsWith("tools/tuff_repl.ts")
) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  });
}
