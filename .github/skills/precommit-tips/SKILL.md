---
name: precommit-tips
description: "Guide for resolving precommit check failures. Use when tests fail, code quality checks fail, or linting errors occur. Keywords: precommit, checkstyle, testing, code quality, build failures, linting."
---

# Pre-Commit Checks and Resolution Guide

## Overview

Pre-commit checks are automated validations that run before code is committed to ensure code quality, maintainability, and correctness. This guide helps you understand and resolve common check failures in the Tuff project.

## Checks in This Project

### 1. Compilation Check

**Purpose**: Ensures code compiles without errors
**Run**: `mvn compile`
**Typical Failures**:

- Syntax errors
- Missing imports
- Type mismatches
- Undefined variables or methods

**Resolution**:

- Read the compiler error message carefully—it points to the exact line and problem
- Fix the syntax or import issues
- Verify type compatibility
- Re-run: `mvn compile`

### 2. Unit Tests

**Purpose**: Verifies all tests pass
**Run**: `mvn test`
**Typical Failures**:

- Assertion failures (expected vs actual values)
- Exceptions thrown
- Test timeouts
- Test dependencies failing

**Resolution**:

- Read the test failure message to understand what went wrong
- Use hypothesis-driven debugging to isolate the cause
- Fix the implementation to match test expectations
- Re-run: `mvn test`

**Key Principle**: Tests define the contract. If a test fails, the code must change, not the test.

### 3. Checkstyle Linting

**Purpose**: Enforces code style and quality standards
**Run**: `mvn checkstyle:check`
**Configuration**: [checkstyle.xml](../../../checkstyle.xml)

**Rule: File Length ≤ 500 lines**

- Applies to: All Java files
- Purpose: Keeps files focused and maintainable
- Failure Message: "File length is X lines (max allowed is 500)"

**Resolution**:

- Split large files into smaller, focused classes
- Consider extracting helpers to separate files
- Look for distinct responsibilities that could be separate classes
- Common approach: Move inner classes or helpers to their own files

**Example**:

```
Large file: App.java (600 lines)
Solution: Extract parsing logic to ExpressionParser.java (300 lines)
          Keep main App.java at 300 lines
```

**Rule: Method Length ≤ 50 lines**

- Applies to: All methods (including constructors)
- Purpose: Methods should have single, clear responsibility
- Failure Message: "Method X is X lines (max allowed is 50)"

**Resolution**:

- Extract sub-tasks into separate helper methods
- Look for loops or conditional blocks that could be methods
- Each method should do one thing well
- Helper method names should describe their purpose

**Example**:

```
Long method (75 lines):
  void processExpression(String expr) {
    // 20 lines: parse input
    // 30 lines: validate types
    // 25 lines: generate instructions
  }

Solution: Extract into helper methods
  void processExpression(String expr) {
    var parsed = parseInput(expr);        // 5 lines
    validateTypes(parsed);                // 3 lines
    var instructions = generateInstructions(parsed); // 3 lines
  }

  private ParseResult parseInput(String expr) { /* 20 lines */ }
  private void validateTypes(ParseResult r) { /* 30 lines */ }
  private Instruction[] generateInstructions(ParseResult r) { /* 25 lines */ }
```

**Rule: Boolean Fields ≤ 3 per class**

- Applies to: Class fields of type `boolean`
- Purpose: Too many boolean flags indicate design issues
- Failure Message: "Boolean field count is X (max allowed is 3)"

**Resolution**:

- Refactor boolean flags into enums or states
- Consider if boolean fields should be method parameters instead
- Look for opportunities to use domain-specific types

**Example**:

```
Too many booleans:
  class Parser {
    boolean isReadingExpression;
    boolean isProcessingOperator;
    boolean hasEncounteredError;
    boolean shouldContinue;
    boolean isInLetBinding;
  }

Solution: Use an enum or state object
  enum ParserState {
    READING_EXPRESSION, PROCESSING_OPERATOR, IN_LET_BINDING, ERROR
  }

  class Parser {
    ParserState state;
    // Boolean fields reduced to 0-2 for specific flags
  }
```

### 4. PMD Copy-Paste Detector (CPD)

**Purpose**: Detects duplicated code blocks that should be refactored
**Run**: `pmd cpd --dir src --language java --minimum-tokens 50 --format markdown`
**Configuration**: Minimum 50 tokens (approximately 5-10 lines of code)

**Typical Failures**:

- Same logic appears in multiple places
- Similar code blocks with minor variations
- Duplicated algorithms or patterns

**Failure Message Example**:

```
Found 1 clone:
  File: src/main/java/io/github/sirmathhman/tuff/App.java
  Lines: 100-110
  File: src/main/java/io/github/sirmathhman/tuff/Vm.java
  Lines: 200-210
  Tokens: 55
```

**Resolution**:

1. Identify the common logic in the duplicated blocks
2. Extract into a shared helper method or class
3. Update both locations to call the helper
4. Verify tests still pass
5. Re-run CPD to confirm duplicates are gone

**Example**:

```java
// Duplicate 1 - in Parser.java
long result = 0;
for (int i = 0; i < input.length; i++) {
  result += input[i] * weights[i];
}
return result;

// Duplicate 2 - in Calculator.java
long sum = 0;
for (int i = 0; i < values.length; i++) {
  sum += values[i] * factors[i];
}
return sum;

// Solution: Extract to shared helper
private static long calculateWeightedSum(long[] data, long[] multipliers) {
  long result = 0;
  for (int i = 0; i < data.length; i++) {
    result += data[i] * multipliers[i];
  }
  return result;
}

// Both now call: calculateWeightedSum(input, weights);
```

**Why This Matters**:

- Duplicated code is harder to maintain (fix bug in one place = fix in all places)
- Increases file sizes unnecessarily
- Makes refactoring riskier
- Common duplication is a sign to extract a helper

## Workflow: Resolving Check Failures

### Step 1: Identify Which Check Failed

```bash
mvn verify
```

This runs all checks and reports which ones failed:

- Compilation errors
- Test failures
- Checkstyle violations

### Step 2: Understand the Failure

Read the error message carefully:

- **Line number**: Points to exact location
- **Message**: Describes the problem
- **Context**: Shows what's expected vs actual

### Step 3: Fix the Issue

Apply the appropriate fix based on the check type:

- **Compilation**: Fix syntax/imports
- **Tests**: Fix implementation to match test expectations
- **Checkstyle**: Refactor code to meet standards
- **PMD CPD**: Extract duplicated code into shared helpers

### Step 4: Verify the Fix

Run just that check to confirm it passes:

```bash
mvn compile              # For compilation
mvn test                 # For tests
mvn checkstyle:check     # For style
pmd cpd --dir src --language java --minimum-tokens 50 --format markdown  # For duplication
```

### Step 5: Run Full Verification

```bash
mvn verify
```

All checks must pass before committing.

## Common Scenarios and Solutions

### Scenario: "Method is too long"

**Problem**: A method has > 50 lines
**Solution**:

1. Identify the distinct tasks within the method
2. Extract each task into a helper method
3. Call the helper methods from the original method
4. Verify test still passes

### Scenario: "File is too long"

**Problem**: A class file has > 500 lines
**Solution**:

1. Identify classes or functionality that can be extracted
2. Create new files for extracted functionality
3. Import/use the new classes in the original
4. Verify all tests still pass

### Scenario: "Test failed: expected X but got Y"

**Problem**: Test assertion failed
**Solution**:

1. Examine what the test expects
2. Run the code to see what it actually produces
3. Fix the implementation to match the test expectation
4. OR if test is wrong, fix the test first (consult team)

### Scenario: "Too many boolean fields"

**Problem**: Class has > 3 boolean fields
**Solution**:

1. Group related booleans into an enum or state class
2. Reduce number of independent boolean flags
3. Consider if some booleans should be constructor parameters

### Scenario: "Found N clones" (PMD CPD)

**Problem**: Duplicated code detected
**Solution**:

1. Examine the duplicate blocks to understand the common logic
2. Identify what varies between the duplicates (parameters, variable names, etc.)
3. Extract common logic into a helper method with parameters for the differences
4. Update both locations to call the helper method
5. Verify all tests still pass

**Example**:

- Duplicate 1 validates User object
- Duplicate 2 validates Product object
- Solution: Extract generic `validateObject` method that takes field descriptors

### Scenario: Circular Import or Missing Dependency

**Problem**: "Cannot find symbol" or import errors
**Solution**:

1. Check spelling of class/package name
2. Verify import statement is correct
3. Check if the class exists in the codebase
4. Add Maven dependency if from external library

## Best Practices

### Before Making Changes

- [ ] Run `mvn verify` to establish baseline
- [ ] Understand what each check requires
- [ ] Read any relevant documentation

### While Making Changes

- [ ] Keep methods focused (ideally < 30 lines)
- [ ] Keep files focused (ideally < 400 lines)
- [ ] Minimize boolean flags (prefer enums/states)
- [ ] Write code with tests in mind

### Before Committing

- [ ] Run `mvn verify` to ensure all checks pass
- [ ] Run `mvn test` to ensure no regressions
- [ ] Review your changes for code quality
- [ ] Verify new tests were added for new functionality

## Debugging Check Failures

If you're unsure why a check is failing:

1. **Run with verbose output**:

   ```bash
   mvn verify -X        # Very verbose
   mvn verify -e        # With full stacktrace
   ```

2. **Run individual checks**:

   ```bash
   mvn compile           # Just compilation
   mvn checkstyle:check  # Just linting
   mvn test              # Just tests
   pmd cpd --dir src --language java --minimum-tokens 50 --format markdown  # Just duplication
   ```

3. **Check configuration files**:
   - [checkstyle.xml](../../../checkstyle.xml) - Style rules
   - [pom.xml](../../../pom.xml) - Build configuration
   - [.husky/pre-commit](../../../.husky/pre-commit) - Pre-commit hook definition

4. **Review recent changes**:
   - Most failures are in recently modified code
   - Compare current version with previous working version

## Tips for Passing All Checks

1. **Code as you build**: Fix issues immediately, not after
2. **Test-first approach**: Write tests before implementation
3. **Run checks frequently**: `mvn verify` should be muscle memory
4. **Keep it simple**: Simple code passes checks easier than complex code
5. **Ask for help**: If unsure, consult the team or documentation
6. **Document decisions**: Comments explaining non-obvious code prevent future issues
