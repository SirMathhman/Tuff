---
name: hypothesis-driven-debugging
description: "Systematic debugging methodology using hypothesis formation and targeted testing. Use when investigating bugs, understanding failures, or isolating root causes. Keywords: debugging, hypothesis, testing, root cause analysis, systematic investigation."
---

# Hypothesis-Driven Debugging

## Overview

Hypothesis-driven debugging is a systematic approach to finding and fixing bugs by forming testable hypotheses about the root cause and validating them through targeted testing. Rather than random exploration, this method uses evidence to narrow down possibilities until the cause is identified.

## When to Use This Skill

- **Test failures**: When a test fails and you need to understand why
- **Runtime errors**: When the application crashes or behaves unexpectedly
- **Logic bugs**: When code produces incorrect results
- **Integration issues**: When components don't work together as expected
- **Performance problems**: When code runs slower than expected
- **Flaky tests**: When tests pass/fail unpredictably

## Core Workflow

### Step 1: Observe and Gather Information

**Goal**: Collect detailed information about the problem.

**Process**:

1. Read the error message carefully—note the exact failure point
2. Identify the test or scenario that reproduces the issue
3. Collect relevant context:
   - Stack traces
   - Test output
   - System state (if applicable)
   - Recent code changes
   - Conditions that trigger the failure

### Step 2: Form a Hypothesis

**Goal**: Create a testable theory about the root cause.

**Process**:

1. Analyze the gathered information
2. Consider the most likely causes:
   - Recent code changes
   - Incorrect assumptions in the code
   - Edge cases not handled
   - Integration issues between components
   - Environmental differences
3. Form a specific, testable hypothesis
   - ✅ "The bug occurs because variable X is null when function Y is called"
   - ✅ "The test fails when the input exceeds 1000 characters"
   - ❌ "Something is broken" (too vague)
   - ❌ "It might be a timing issue" (not specific enough)

**Hypothesis Template**:

> "The [observed behavior] occurs because [specific root cause]. Evidence: [what led to this hypothesis]."

### Step 3: Design a Test

**Goal**: Create a focused test that validates or refutes the hypothesis.

**Key Principles**:

- **Use the project's testing framework** — Don't create debug files or write to console output
- **Isolate the variable** — Change one thing to test one hypothesis
- **Make it repeatable** — The test should produce consistent results
- **Make it focused** — The test should target the specific hypothesis, not multiple things

**Anti-patterns**:

- ❌ Writing temporary debug code or print statements
- ❌ Creating random test files
- ❌ Testing multiple variables at once
- ❌ Using console output instead of assertions

**Good test design**:

```
Test: Verify function X returns correct value when input is null
Test: Verify function Y handles empty list correctly
Test: Verify component A communicates correctly with component B
```

### Step 4: Run the Test

**Goal**: Execute the test and observe the results.

**Process**:

1. Run your targeted test
2. Record the exact output/failure message
3. Note any unexpected behaviors
4. Compare against your hypothesis prediction

### Step 5: Analyze Results

**Goal**: Interpret the results to confirm or refute your hypothesis.

**Outcomes**:

**Hypothesis Confirmed**: The test result matches your prediction

- You've found the root cause
- Proceed to fix the issue
- Write a proper test to prevent regression

**Hypothesis Refuted**: The test result contradicts your prediction

- Your understanding was incorrect
- Use this new information to refine your hypothesis
- Return to Step 2 with better knowledge

**Inconclusive**: The test didn't provide enough information

- The hypothesis was not specific enough, OR
- The test didn't adequately isolate the variable
- Refine your hypothesis or redesign the test
- Return to Step 2 or Step 3

### Step 6: Refine or Repeat

**Goal**: Continue narrowing down the root cause through successive hypotheses.

**Key Concept**: Each iteration eliminates possibilities, bringing you closer to the root cause. Even refuted hypotheses are progress—they tell you where the bug is NOT, which narrows the search space.

**Process**:

1. If hypothesis was refuted: Form a new hypothesis based on the evidence
   - You've eliminated one possibility
   - You've learned something about how the system actually works
   - Use this new knowledge to narrow your search
2. If results were inconclusive: Make your hypothesis more specific or your test more focused
   - A vague hypothesis won't narrow anything down
   - Make your next test more targeted
3. Design a new test that targets the refined hypothesis
4. Return to Step 4 and repeat

**The Narrowing Process**:

> Iteration 1: "Is it problem A?"
> Iteration 2: "Is it problem B?"
> Iteration 3: "Is it problem C?"
> Each NO eliminates a possibility, narrowing the cause
> Eventually: "It must be problem D" (only possibility left)

## Example: Debugging a Failing Test

### Initial Problem

```
Test: shouldCalculateSumOfNumbers
Expected: 15
Actual: 0
```

**What we know**: The sum of [1,2,3,4,5] should be 15, but we're getting 0.

### Narrowing Down the Cause

Notice how each iteration eliminates one piece of the puzzle, progressively narrowing where the bug could be:

### Iteration 1: Is the function accessible?

**Hypothesis**: "The sum function is not being called"
**Test**: Add a test that verifies the function is callable
**Result**: Function is callable ✓
**Outcome**: Hypothesis refuted
**What we learned**: Bug is NOT about function accessibility. Narrowed search to: function execution.

### Iteration 2: Does the function receive correct input?

**Hypothesis**: "The function is called, but receives wrong input"
**Test**: Add a test that captures the actual input to the sum function
**Result**: Input is correct [1, 2, 3, 4, 5] ✓
**Outcome**: Hypothesis refuted
**What we learned**: Bug is NOT about input preparation. Narrowed search to: function logic.

### Iteration 3: Is the main loop executing?

**Hypothesis**: "The sum function has a logic error in its loop"
**Test**: Add a test for the loop: Does it iterate the correct number of times?
**Result**: Loop iterates 0 times ✗
**Outcome**: Hypothesis confirmed
**What we learned**: Bug IS in loop execution. Found the root cause.

### Root Cause Identified

The loop initializer is incorrect, causing it to skip. We narrowed down from "something in this function" to "specifically the loop initialization."

### Root Cause Fixed

Fix the loop initializer based on our findings.

### Prevention

Add test: `shouldIterateCorrectNumberOfTimes()` to prevent regression

## Best Practices

### Make Hypotheses Specific

- ✅ "Variable `count` is -1 instead of 0, causing the loop to not execute"
- ❌ "There's a bug in the loop"

### Test One Thing at a Time

- ✅ Test if function receives correct input (then test if it processes correctly)
- ❌ Test entire flow in one test

### Use Assertions, Not Console Output

- ✅ `assert result == 5, f"Expected 5, got {result}"`
- ❌ `console.log(result)`

### Make Tests Deterministic

- ✅ Use fixed test data that always produces the same result
- ❌ Use random data or timing-dependent values

### Document Your Hypothesis

- ✅ Add comments explaining what the test validates and why
- ❌ Leave tests unexplained

### Know When to Stop Hypothesizing

- After 5-10 iterations without progress, consider:
  - Taking a break and approaching fresh
  - Asking for another perspective
  - Reviewing related code more broadly
  - Using profiling or additional tools

## Common Debugging Scenarios

### Scenario: Off-by-One Error

**Hypothesis**: "The loop index calculation is wrong"
**Test**:

```
Test with array of known size and verify iteration count
Test with empty array
Test with single element
Test with boundary values
```

### Scenario: Null Pointer Exception

**Hypothesis**: "Object X is null when method Y is called"
**Test**:

```
Test: Verify object X is initialized before method Y
Test: Verify method Y checks for null
Test: Verify calling sequence is correct
```

### Scenario: Wrong Type Conversion

**Hypothesis**: "Variable is converted to wrong type"
**Test**:

```
Test: Verify input type is correct
Test: Verify conversion logic is correct
Test: Verify output type is correct
```

### Scenario: Timing/Race Condition

**Hypothesis**: "Operation A happens before operation B should complete"
**Test**:

```
Test: Run operation B in isolation
Test: Verify operation A completes before B
Test: Run repeatedly to identify non-determinism
```

## Tips for Efficient Debugging

1. **Read error messages completely** — The first line often contains the answer
2. **Check recent changes** — Most bugs are in recently modified code
3. **Verify your assumptions** — Test things you think you know for sure
4. **Start with the obvious** — Check easy things first (null checks, type mismatches)
5. **Use version control** — Compare current code with working version
6. **Separate concerns** — Test individual components before testing integration
7. **Keep debugging sessions short** — Take breaks to maintain perspective
8. **Document your process** — Record what you tried and what you learned
