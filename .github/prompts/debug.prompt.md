---
name: debug
description: Debug the current issue.
---

You will be debugging the codebase using test driven and error driven techniques.
Follow these steps in the order specified strictly:

1. Run the command `pnpm start`, which will most likely fail. If it does not fail, review relevant files to ensure that the expected output actually equals what the source code probably expects.
2. When you see the error message, evaluate whether it is a good error message or not. A good error mesage must have four criteria: The cause, the reason why it is an error, the suggested fix, and context.
3. Improve the error message if it is deficient. If you see the exact same error without your modifications, then this means that the same error message is most likely in multiple places.
4. Write a minimal test to replicate the issue. You are encouraged to write as many tests as you need to replicate the issue, although all tests need to be passing in the end.
5. Then create the fix.
6. Rerun `pnpm start` to ensure the issue is resolved.
7. Finally, make a commit with your changes, with an informative message that contains details on why the problem occurred, the fix, and any relevant references.
