---
name: implement
description: Implementing new features.
---

The user will provide expectations (either requirements for success or failure cases). These steps must be followed in a strict order. When you are doing your task, you must announce what step you are on.

1. Read the [entry file](../../src/index.ts) and [generated entry file](../../src/main.js) to understand the difference. Furthermore, you are advised to execute `npm run start` to get further information.
2. Write a failing test for the new feature.
3. Implement the feature to make the test pass. For error cases, ensure you define: what the error is, why it's an error, and how to fix it.
4. Verify the implementation meets all requirements and passes all tests.
5. Commit your changes, respecting all pre-commit checks.

- You MUST refactor duplicates and you MUST fix linting issues. This includes preexisting issues.
- When refactoring duplicates, here is some advice. If the snippet is mostly declarations or types, extract an interface, parameter object, or type alias.
- Do NOT change the project configuration unless instructed to by the user.

6. You MUST verify using `git log` that the commit went through.
