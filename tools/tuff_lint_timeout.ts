import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface FluffModule {
  main: (argv: string[]) => number;
  project_error_count: () => number;
  project_warning_count: () => number;
}

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

export function parseLintTimeoutArgs(argv: string[]): {
  timeoutMs: number;
  forwardedArgs: string[];
} {
  let timeoutMs: number | undefined;
  const forwardedArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--timeout-ms") {
      const v = argv[i + 1];
      i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) timeoutMs = n;
      continue;
    }

    if (a.startsWith("--timeout-ms=")) {
      const n = Number(a.slice("--timeout-ms=".length));
      if (Number.isFinite(n) && n > 0) timeoutMs = n;
      continue;
    }

    forwardedArgs.push(a);
  }

  const envTimeout = Number(process.env.TUFF_LINT_TIMEOUT_MS);
  const envOk = Number.isFinite(envTimeout) && envTimeout > 0;

  return {
    timeoutMs: timeoutMs ?? (envOk ? envTimeout : 60_000),
    forwardedArgs,
  };
}

export async function main(): Promise<number> {
  const root = repoRootFromHere();
  const fluffFile = resolve(root, "selfhost", "prebuilt", "fluff.mjs");
  const fluff = (await import(
    pathToFileURL(fluffFile).toString()
  )) as FluffModule;

  if (typeof fluff.main !== "function") {
    console.error(`expected prebuilt fluff to export main(): ${fluffFile}`);
    return 1;
  }

  const compilerRoot = resolve(
    root,
    "src",
    "main",
    "tuff",
    "compiler",
    "tuffc.tuff"
  );

  const { timeoutMs, forwardedArgs } = parseLintTimeoutArgs(
    process.argv.slice(2)
  );

  const timer = setTimeout(() => {
    console.error(`✗ Linting timed out after ${timeoutMs}ms`);
    process.exit(124);
  }, timeoutMs);
  // Don't keep the process alive just for the timer.
  timer.unref?.();

  console.log(
    `Running Tuff linter on compiler sources (timeout ${timeoutMs}ms)...`
  );
  const exitCode = await fluff.main([...forwardedArgs, compilerRoot]);

  const errorCount =
    typeof fluff.project_error_count === "function"
      ? fluff.project_error_count()
      : 0;
  const warningCount =
    typeof fluff.project_warning_count === "function"
      ? fluff.project_warning_count()
      : 0;

  const parts: string[] = [];
  if (errorCount > 0)
    parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  if (warningCount > 0)
    parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);

  if (exitCode === 0) {
    if (warningCount > 0) {
      console.log(`✓ Linting passed with ${parts.join(", ")}`);
    } else {
      console.log(`✓ Linting passed (no issues found)`);
    }
  } else {
    console.error(`✗ Linting failed: ${parts.join(", ")}`);
  }

  return exitCode;
}

if (
  process.argv[1] &&
  process.argv[1].replaceAll("\\", "/").endsWith("tools/tuff_lint_timeout.ts")
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
