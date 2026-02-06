---
name: fix-compiler
description: Describe when to use this prompt
---

The user has indicated that the generated code from the compiler is invalid. Confirm this by attempting to build the file.

If new syntax is introduced, you MUST ask the user about semantics using #tool:vscode/askQuestions and be thorough.

For now, the only generated file is `lib.c`.

Your goal is to correct the compiler to generate valid C code.