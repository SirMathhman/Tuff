import * as fs from "fs";
import * as path from "path";
import { DiagnosticReporter } from "./common/diagnostics.js";
import {
  compileSource,
  computeExitCode,
  getTypeScriptOutputPath,
} from "./compiler/compile.js";
import { emitTypeScript } from "./compiler/emit_ts.js";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Tuff Compiler - Stage 0");
    console.log("Usage: tuff <file.tuff>");
    return;
  }

  const filePath = args[0];
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`Compiling ${absolutePath}...`);
  const source = fs.readFileSync(absolutePath, "utf8");

  const reporter = new DiagnosticReporter();
  const program = compileSource(source, absolutePath, reporter);

  if (reporter.hasErrors()) {
    process.exit(1);
  }

  const ts = emitTypeScript(program);
  const outPath = getTypeScriptOutputPath(absolutePath);
  fs.writeFileSync(outPath, ts, "utf8");
  console.log(`Wrote ${outPath}`);

  const exitCode = computeExitCode(program);
  process.exit(exitCode);
}

main();
