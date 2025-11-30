# Tuff Compiler

A self-hosting compiler for the **Tuff** programming language, targeting JavaScript and C++.

## Project Structure

This is a monorepo containing the core language definitions and platform-specific implementations.

- **core/**: Common language definitions, standard library interfaces (`expect` declarations), and shared logic.
- **js/**: JavaScript target implementation (`actual` definitions).
- **cpp/**: C++ target implementation (`actual` definitions).
- **bootstrap/**: Stage 0 compiler written in Node.js (JavaScript) to bootstrap the language.

## Language Features

- **Static Typing**: Strong type system with inference.
- **Generics**: C++ template-style generics (monomorphization).
- **Multi-Platform**: Native support for `expect`/`actual` pattern to handle platform differences.
- **Targets**:
  - JavaScript (Node.js/Browser)
  - C++ (Native performance, no LLVM dependency for now)

## Building

(TODO: Add build instructions)
