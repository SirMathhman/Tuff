import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

interface FluffModule {
  main: (argv: string[]) => number;
  project_error_count: () => number;
  project_warning_count: () => number;
}

export function makeFluffArgv(
  compilerRoot: string,
  extraArgs: string[]
): string[] {
  return [...extraArgs, compilerRoot];
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

  // Run fluff on the compiler source directory
  const compilerRoot = resolve(
    root,
    "src",
    "main",
    "tuff",
    "compiler",
    "tuffc.tuff"
  );

  // Forward any additional CLI args (e.g. `npm run lint -- --debug --format json`).
  // These are passed directly to the Tuff `fluff` CLI.
  const extraArgs = process.argv.slice(2);

  console.log(`Running Tuff linter on compiler sources...`);
  const exitCode = await fluff.run(makeFluffArgv(compilerRoot, extraArgs));

  // Get counts for summary
  const errorCount =
    typeof fluff.project_error_count === "function"
      ? fluff.project_error_count()
      : 0;
  const warningCount =
    typeof fluff.project_warning_count === "function"
      ? fluff.project_warning_count()
      : 0;

  // Print summary
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
  process.argv[1].replaceAll("\\", "/").endsWith("tools/tuff_lint.ts")
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
