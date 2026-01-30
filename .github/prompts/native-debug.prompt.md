---
name: native-debug
description: Debug the current error being given in native code.
---

The native runtime is giving an error. This should never happen with the language. This means that the compilation output is malformed.

This query is to NOT add unsupported features. If features are unsupported,
then the objective is to prevent native code from being generated at all,
and instead ensure that the compiler provides an error on invalid syntax being detected.

Do not remove experimental code. The goal is to get the compiler to REJECT unsupported features at compile-time, not runtime. All tests should still pass, because tests are an indication of what the compiler currently supports.

Follow instructions [here](./debug.prompt.md).
