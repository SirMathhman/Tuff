#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { compile } = require("./pipeline/compile");

function printHelp() {
  const text = [
    "tuffc <input.tuff> -o <output.js>",
    "",
    "Options:",
    "  -o, --out <file>   Output JS file",
    "  --ast              Print AST JSON to stdout",
    "  --tokens           Print tokens to stdout",
    "  --help             Show help",
  ].join("\n");
  console.log(text);
}

function parseArgs(argv) {
  const args = { input: null, out: null, ast: false, tokens: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--ast") {
      args.ast = true;
      continue;
    }
    if (arg === "--tokens") {
      args.tokens = true;
      continue;
    }
    if (arg === "-o" || arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (!args.input) {
      args.input = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) {
    printHelp();
    process.exit(args.input ? 0 : 1);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const source = fs.readFileSync(inputPath, "utf8");
  const result = compile({
    source,
    filePath: inputPath,
    emitTokens: args.tokens,
    emitAst: args.ast,
  });

  if (args.tokens) {
    console.log(JSON.stringify(result.tokens, null, 2));
    return;
  }
  if (args.ast) {
    console.log(JSON.stringify(result.ast, null, 2));
    return;
  }

  const outPath = args.out
    ? path.resolve(process.cwd(), args.out)
    : inputPath.replace(/\.tuff$/i, ".js");

  fs.writeFileSync(outPath, result.code, "utf8");
  console.log(`Wrote ${outPath}`);
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
}
