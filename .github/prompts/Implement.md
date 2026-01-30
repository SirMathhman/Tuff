---
name: implement
description: Implement a feature using Test-Driven Development workflow.
argument-hint: The desired feature requirement or test case to implement
---

# Test-Driven Development Implementation

Follow this workflow to implement the requested feature using TDD:

1. **Write the test first**: Add a test case that specifies the desired behavior. The test should fail initially because the feature is not yet implemented.

2. **Verify the test fails**: Run the test suite to confirm the new test fails with the expected failure message.

3. **Implement the feature**: Write the minimal code necessary to make the test pass. Focus on correctness over generality at this stage.

4. **Verify all tests pass**: Run the complete test suite to ensure the new implementation passes and doesn't break existing tests.

5. **Iterate**: If additional requirements or edge cases emerge, repeat this cycle by adding new tests first.

6. **Commit changes**: After all tests pass and code quality checks are satisfied, commit the changes. Always allow precommit hooks to run—never use `--no-verify`. The precommit hooks verify code quality and must pass before the commit is accepted.

**Key principles:**

- Tests define the contract for the feature
- Implementation should be driven by test requirements, not assumptions
- All tests should pass before considering the feature complete
- Commits are required at the end; precommit hooks must pass without exception
- Never bypass precommit hooks with `--no-verify`
