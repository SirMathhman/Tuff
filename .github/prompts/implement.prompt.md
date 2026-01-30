---
name: implement
description: Implementing new features.
---

The user will provide expectations (either requirements for success or failure cases). These steps must be followed in a strict order. When you are doing your task, you must announce what step you are on.

1. Read the [main file](../../src/main.tuff) and [generated main file](../../src/main.js) to understand the difference. Furthermore, you are advised to execute `bun run start` to get further information.
2. Write a minimal failing test for the new feature. This failing test may or may not be the same conditions as the original test, but it must be enough to demonstrate the feature is not yet implemented.
3. Implement the feature to make the test pass. For error cases, ensure you define: what the error is, why it's an error, and how to fix it.
4. Verify the implementation meets all requirements and passes all tests.
5. Verify that `bun run start` also works as expected. If it does not work as expect, this means that your test is not sufficient, and you must go back to step 2 and write another test.
6. Commit your changes, respecting all pre-commit checks.

- You MUST refactor duplicates and you MUST fix linting issues. This includes preexisting issues.
- When refactoring duplicates, here is some advice. If the snippet is mostly declarations or types, extract an interface, parameter object, or type alias.
- Do NOT change the project configuration unless instructed to by the user.

6. You MUST verify using `git log` that the commit went through.
