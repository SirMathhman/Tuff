---
name: implement
description: Implementing new features.
---

- User provides expectations (either requirements for success or failure cases).
- Read the [entry file](../../src/index.ts) and [generated entry file](../../src/main.js) to understand the difference.
- Write a failing test for the new feature.
- Implement the feature to make the test pass. For error cases, ensure you define: what the error is, why it's an error, and how to fix it.
- Verify the implementation meets all requirements and passes all tests.
- Commit your changes, respecting all pre-commit checks.
