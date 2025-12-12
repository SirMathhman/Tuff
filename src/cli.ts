import { compileToESM } from "./index";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function usage(): never {
  // Keep it minimal for now
  console.error("Usage: bun run src/cli.ts <input.tuff> --outdir <dir>");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const input = args[0];
  const outdirIdx = args.indexOf("--outdir");
  const outdir = outdirIdx >= 0 ? args[outdirIdx + 1] : "out";
  if (!outdir) usage();

  const src = await readFile(input, "utf8");
  const { js, diagnostics } = compileToESM({
    filePath: resolve(input),
    source: src,
  });
  const errors = diagnostics.filter((d) => d.severity === "error");
  for (const d of diagnostics) {
    const prefix = d.severity === "error" ? "error" : "warn";
    console.error(`${prefix}: ${d.message}`);
  }
  if (errors.length) process.exit(1);

  const outFile = resolve(
    outdir,
    input
      .replace(/\\/g, "/")
      .replace(/^.*\//, "")
      .replace(/\.tuff$/, "") + ".mjs"
  );
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, js, "utf8");
  console.log(outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
