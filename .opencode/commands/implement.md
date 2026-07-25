---
description: Implement a feature end-to-end via TDD micro-sprints — deep understanding first, then minimal emergent design.
agent: build
---

Implement the following feature using a disciplined, test-driven micro-sprint process:

$ARGUMENTS

Follow this step-by-step process strictly. When working through it, loudly and proudly announce what step you are on in this format. Furthermore, you MUST set up your to-do list to contain each of these steps:

# Step <number>: <description of the step>

1. Understand the objective. Aggressively ask clarifying questions. Do NOT proceed until every ambiguity is resolved. Ask about the happy path, error cases, boundary conditions, and explicitly invalid inputs. You must understand the feature holistically — not just what it does, but what it must never do. Do not assume anything that has not been confirmed by the user.
   - Definition of correct: The reason behind the objective is well-understood, including the intent and expected behavior in all known cases.
   - Definition of complete: All necessary information to implement the objective is obtained, including both positive (valid) and negative (invalid/error) scenarios.
   - When in doubt: ask again. More questions now means fewer mistakes later.
2. Consider user stories that would satisfy the objective. Suggested format: "As a <type of user>, I want <some goal> so that <some reason>", but this is not strict.
3. Add end-to-end test cases that would satisfy the user stories. You MUST cover both positive cases (valid inputs, expected success paths) and negative cases (invalid inputs, error conditions, boundary values, rejected inputs). Coverage must be holistic.
4. Run the failing test cases. You MUST run the test cases before implementation to collect better information about what has to be changed. Do not begin reading repository files until after the initial tests have been inserted and run; use the failing test output to drive a targeted search instead of a broad search.
5. Implement the simplest thing that could possibly work to satisfy the test cases. The implementation should be minimal — no extra features, no speculative code, no gold-plating. The understanding was thorough; the code should be lean.
6. Ensure the tests pass.
7. Refactor as needed in accordance with the check script, if it is present.
8. Make a commit. Never use --no-verify; respect the precommit hook if it is present.
9. Perform a retrospective. Reflect on what went well, what could be improved, and what you learned.

Key deliverables (5+ items):

- Test cases
- Commit hash
- Retrospective notes (at least 3 items):
  - What went well
  - What could be improved (especially in terms of the development experience — note any tool friction or gaps here)
  - What was learned
