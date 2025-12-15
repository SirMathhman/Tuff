import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

export async function main(): Promise<number> {
  const root = repoRootFromHere();
  const fluffFile = resolve(root, "selfhost", "prebuilt", "fluff.mjs");
  const fluff = await import(pathToFileURL(fluffFile).toString());

  if (typeof (fluff as any).main !== "function") {
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

  console.log(`Running Tuff linter on compiler sources...`);
  const exitCode = await (fluff as any).main([compilerRoot]);

  if (exitCode === 0) {
    console.log(`✓ Linting passed`);
  } else {
    console.error(`✗ Linting failed with exit code ${exitCode}`);
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
