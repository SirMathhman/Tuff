#!/usr/bin/env node

/**
 * Tuff Compiler CLI
 * Entry point for the bootstrap compiler
 */

import fs from "fs";
import path from "path";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { IRGenerator } from "./ir.js";
import { JSCodegen } from "./codegen-js.js";

function usage() {
  console.error("Usage: tuff [command] [options]");
  console.error("");
  console.error("Commands:");
  console.error("  compile <file>    Compile a Tuff source file to JavaScript");
  console.error("  run <file>        Compile and run a Tuff program");
  console.error("  tokens <file>     Show tokens from lexer");
  console.error("  ast <file>        Show AST from parser");
  console.error("  ir <file>         Show IR from generator");
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error(`Error reading file: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`Wrote output to: ${filePath}`);
  } catch (err) {
    console.error(`Error writing file: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

function compile(sourceFile) {
  console.log(`Compiling: ${sourceFile}`);

  const source = readFile(sourceFile);

  try {
    // Lexing
    console.log("  Lexing...");
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    // Parsing
    console.log("  Parsing...");
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // JavaScript Codegen (direct from AST)
    console.log("  Generating JavaScript...");
    const jsCodegen = new JSCodegen(ast);
    const jsCode = jsCodegen.generate();

    // Output
    const outputFile = sourceFile.replace(/\.tuff$/, ".js");
    writeFile(outputFile, jsCode);

    return { jsCode, outputFile };
  } catch (err) {
    console.error("Compilation error:");
    console.error(err.message);
    process.exit(1);
  }
}

function run(sourceFile) {
  const { jsCode, outputFile } = compile(sourceFile);

  console.log("Running...");
  console.log("---");

  try {
    // Execute the generated JavaScript
    eval(jsCode);
  } catch (err) {
    console.error("Runtime error:");
    console.error(err.message);
    process.exit(1);
  }
}

function showTokens(sourceFile) {
  const source = readFile(sourceFile);

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    console.log("Tokens:");
    for (const token of tokens) {
      console.log(`  ${token.toString()}`);
    }
  } catch (err) {
    console.error("Lexer error:");
    console.error(err.message);
    process.exit(1);
  }
}

function showAST(sourceFile) {
  const source = readFile(sourceFile);

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens);
    const ast = parser.parse();

    console.log("AST:");
    console.log(JSON.stringify(ast, null, 2));
  } catch (err) {
    console.error("Parser error:");
    console.error(err.message);
    process.exit(1);
  }
}

function showIR(sourceFile) {
  const source = readFile(sourceFile);

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens);
    const ast = parser.parse();

    const irGenerator = new IRGenerator();
    const ir = irGenerator.generate(ast);

    console.log("IR:");
    for (let i = 0; i < ir.length; i++) {
      console.log(`  [${i}] ${ir[i].toString()}`);
    }
  } catch (err) {
    console.error("IR generation error:");
    console.error(err.message);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  usage();
  process.exit(1);
}

const command = args[0];
const sourceFile = args[1];

switch (command) {
  case "compile":
    if (!sourceFile) {
      console.error("Error: no source file specified");
      usage();
      process.exit(1);
    }
    compile(sourceFile);
    break;

  case "run":
    if (!sourceFile) {
      console.error("Error: no source file specified");
      usage();
      process.exit(1);
    }
    run(sourceFile);
    break;

  case "tokens":
    if (!sourceFile) {
      console.error("Error: no source file specified");
      usage();
      process.exit(1);
    }
    showTokens(sourceFile);
    break;

  case "ast":
    if (!sourceFile) {
      console.error("Error: no source file specified");
      usage();
      process.exit(1);
    }
    showAST(sourceFile);
    break;

  case "ir":
    if (!sourceFile) {
      console.error("Error: no source file specified");
      usage();
      process.exit(1);
    }
    showIR(sourceFile);
    break;

  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}
