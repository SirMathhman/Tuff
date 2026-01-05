# Tuff

Tuff is a self-hosted programming language designed with influences from **Rust**, **TypeScript**, and **Kotlin**. It aims to provide C-level performance and control while maintaining a modern, expressive syntax.

## Project Goals

- **Multi-Target Compilation**: Compiles to LLVM (native), JavaScript, and TypeScript declaration files (`.d.ts`).
- **Self-Hosting**: The compiler is designed to eventually compile itself.
- **Tooling First**: Built-in support for reformatting and refactoring by maintaining high-fidelity ASTs.
- **Package System**: A Java-like package system for modularity and organization.

## Bootstrapping Roadmap

The compiler is being developed in four distinct stages:

- **Stage 0 (Current)**: A pure TypeScript implementation targeting TypeScript.
- **Stage 1**: A hybrid compiler (TS + Tuff) targeting TypeScript.
- **Stage 2**: A hybrid compiler (Tuff + TS) targeting TypeScript and LLVM.
- **Stage 3**: A fully self-hosted Tuff compiler targeting LLVM, JS, and Tuff.

## Project Structure

The project follows a Gradle-like directory structure:

- `src/main/ts`: Stage 0 compiler source code (TypeScript).
- `src/main/tuff`: Future Tuff source code (Stage 1+).
- `src/test/ts`: Unit tests for the compiler (TypeScript/Jest).
- `src/test/tuff`: Integration tests and sample Tuff code.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- [npm](https://www.npmjs.com/)

### Installation

```bash
npm install
```

### Building the Compiler

```bash
npm run build
```

### Running the Compiler

```bash
node dist/index.js <path-to-file.tuff>
```

This will write a TypeScript output file next to the input file (e.g. `main.tuff` -> `main.ts`).

Stage 0 currently performs lexing + parsing and exits with a process exit code determined by the last top-level expression:

- If the last top-level statement is a numeric literal expression, the process exits with that value (normalized to 0–255).
- Otherwise, the process exits with 0.
- If any diagnostics are reported as errors, the process exits with 1.

## License

MIT
