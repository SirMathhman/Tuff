import * as fs from "fs";
import * as path from "path";

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
  // TODO: Initialize Stage 0 Pipeline
}

main();
