---
name: test-driven-development
description: 'Test-driven development (TDD) workflow for implementing features, fixing bugs, and refactoring code. Keywords: testing, unit tests, red-green-refactor, TDD, validation, test-first development.'
---

# Test-Driven Development (TDD) Workflow

## Overview

Test-driven development (TDD) is a disciplined approach to software development that emphasizes writing tests **before** implementing features. This skill provides a structured workflow for building and verifying code using the red-green-refactor cycle.

## When to Use This Skill

- **Adding new features** (any new functionality that requires implementation)
- **Fixing reported bugs** (first write a failing test that reproduces the bug, then fix it)
- **Refactoring existing code** (ensure behavior doesn't change by running existing tests)
- **Code review and validation** (tests serve as executable specifications of expected behavior)

## Red-Green-Refactor Workflow

### Step 1: Red - Write a Failing Test

**Goal**: Define the desired behavior by writing a test that fails.

**Process**:
1. Add a new test method that describes the feature
2. Write the test to verify the expected behavior
3. Use assertion methods appropriate to your testing framework:
   - Assert success cases with expected outputs
   - Assert error cases with expected exceptions or failures
4. Run the test
5. **Verify it fails** - The test should fail with a clear error indicating unimplemented behavior

### Step 2: Green - Implement the Minimum Code

**Goal**: Write the simplest code to make the test pass.

**Process**:
1. Analyze the failing test to understand what functionality is required
2. Implement only the code necessary to make the test pass
3. Avoid gold-plating or adding extra features not covered by the test
4. Run the test again
5. **Verify it passes** - The test should now pass without errors

**Key principle**: The implementation should be minimal and focused. If the test only requires a specific behavior, implement exactly that—nothing more. Additional features should drive additional tests.

### Step 3: Refactor - Improve Code Quality

**Goal**: Clean up code while keeping tests passing.

**Process**:
1. Review the code for:
   - Duplicated logic (extract to helper methods)
   - Long methods (split into smaller, focused methods)
   - Inconsistent naming or structure
   - Unnecessary complexity

2. Make refactoring changes incrementally
3. Run all tests after each change to ensure behavior is preserved
4. **Verify all tests still pass** - Code behavior should remain identical
5. Check code against project standards (style guides, linting rules, etc.)
6. **Verify no quality violations** - Fix any style or quality issues

## Running Tests

The exact commands depend on your testing framework and project configuration. Common examples:

### Run all tests
```bash
npm test                    # JavaScript/Node.js
pytest                      # Python
mvn test                    # Maven (Java)
gradle test                 # Gradle (Java)
dotnet test                 # .NET
```

### Run specific test class or file
```bash
npm test -- TestFile        # JavaScript
pytest tests/test_file.py   # Python
mvn test -Dtest=TestClass   # Maven
gradle test --tests TestClass # Gradle
```

### Run specific test
```bash
npm test -- --testNamePattern="test name"  # JavaScript
pytest tests/test_file.py::test_function   # Python
mvn test -Dtest=TestClass#testMethod       # Maven
gradle test --tests TestClass.testMethod   # Gradle
```

## Test Structure

Well-structured tests follow these principles:

### Naming Convention
Test names should clearly describe what they test:
- ✅ `shouldAddTwoPositiveNumbers`
- ✅ `shouldRejectInvalidEmailFormat`
- ❌ `test1`
- ❌ `doStuff`

### Arrange-Act-Assert Pattern
Structure tests in three phases:

```pseudocode
// Arrange: Set up test data and conditions
input = [1, 2, 3]
expected = 6

// Act: Execute the code being tested
result = sum(input)

// Assert: Verify the result matches expectations
assert result == expected
```

### Test Categories

**Success Cases**: Verify correct behavior
```
Test: addition of two positive numbers
Test: string parsing with valid input
Test: user creation with complete data
```

**Error Cases**: Verify error handling
```
Test: division by zero raises exception
Test: invalid email format is rejected
Test: missing required field returns error
```

**Edge Cases**: Verify boundary conditions
```
Test: empty collection handling
Test: null or undefined inputs
Test: minimum and maximum value ranges
Test: concurrent access handling
```

## Validation Checklist

- [ ] Test method name clearly describes the behavior being tested
- [ ] Test is focused on a single behavior or assertion
- [ ] Test uses appropriate assertion/verification methods
- [ ] Minimal implementation code added to pass the test
- [ ] All existing tests still pass
- [ ] No code quality violations (linting, style guides, etc.)
- [ ] Code follows established patterns in the codebase
- [ ] Tests are independent and don't rely on execution order
- [ ] Test data is clear and relevant to the scenario

## Common Edge Cases and Anti-Patterns

### Edge Cases to Test

**Boundary Values**
- Empty collections, strings, arrays
- Single element vs multiple elements
- Minimum and maximum values for numeric types
- Null/undefined/None inputs

**Type Handling**
- Different input types (if applicable)
- Type mismatches and conversions
- Mixed valid/invalid types

**Concurrency** (if applicable)
- Race conditions
- Resource contention
- Concurrent access patterns

### Anti-Patterns to Avoid

❌ **Over-specification**: Testing implementation details rather than behavior
```
Bad: Tests that verify exact method call counts or internal state
Good: Tests that verify observable behavior and final results
```

❌ **Flaky tests**: Tests that pass/fail unpredictably
```
Bad: Tests dependent on timing, random data, or execution order
Good: Tests with deterministic inputs and isolated state
```

❌ **God tests**: Tests that verify too many things at once
```
Bad: One test covering multiple features and behaviors
Good: One test focused on a single behavior or scenario
```

❌ **Ignoring tests**: Skipped or commented-out tests
```
Bad: @Ignore or @Skip annotations on tests
Good: Fix failing tests or document why they're disabled
```

❌ **Testing the framework**: Tests that verify testing tools rather than your code
```
Bad: Testing that an assertion library works correctly
Good: Using assertions to verify your application logic
```

## Complete Example: Implementing a Feature

This example demonstrates the full TDD workflow for a simple feature.

### Scenario: Adding a `divide` function to a calculator

### Step 1: Red - Write a Failing Test

```python
def test_divide_two_numbers():
    result = calculator.divide(10, 2)
    assert result == 5

def test_divide_by_zero_raises_error():
    with pytest.raises(ZeroDivisionError):
        calculator.divide(10, 0)
```

Run tests: `pytest test_calculator.py::test_divide_two_numbers` → **FAILS** (function doesn't exist)

### Step 2: Green - Implement Minimum Code

```python
class Calculator:
    def divide(self, a, b):
        if b == 0:
            raise ZeroDivisionError("Cannot divide by zero")
        return a / b
```

Run tests: `pytest test_calculator.py::test_divide_*` → **PASSES**

### Step 3: Refactor - Improve Quality

Review and enhance:
- Add type hints
- Improve error messages
- Add docstrings
- Check for code style violations

```python
class Calculator:
    """Simple calculator with basic arithmetic operations."""
    
    def divide(self, dividend: float, divisor: float) -> float:
        """
        Divide two numbers.
        
        Args:
            dividend: The number to divide
            divisor: The number to divide by
            
        Returns:
            The result of division
            
        Raises:
            ZeroDivisionError: If divisor is zero
        """
        if divisor == 0:
            raise ZeroDivisionError("Cannot divide by zero")
        return dividend / divisor
```

Run: `pytest` → All tests pass, `pylint check` → No violations

### Add More Test Cases

Now add additional tests to cover more scenarios:

```python
def test_divide_negative_numbers():
    assert calculator.divide(-10, 2) == -5

def test_divide_with_decimals():
    assert calculator.divide(7.5, 2.5) == 3.0

def test_divide_returns_float():
    result = calculator.divide(10, 3)
    assert isinstance(result, float)
```

Each new test drives new implementation details, following the red-green-refactor cycle.

## Key Benefits of TDD

1. **Clearer Requirements**: Writing tests first forces you to think about requirements upfront
2. **Better Design**: Tests often reveal design issues before significant code is written
3. **Fewer Bugs**: Issues are caught immediately during development
4. **Living Documentation**: Tests serve as executable documentation of expected behavior
5. **Refactoring Confidence**: Comprehensive tests enable safe refactoring
6. **Reduced Debugging Time**: Tests run in seconds; debugging takes minutes or hours

## Best Practices

### Test Independence
- Each test should be independent and not rely on other tests
- Tests should have no shared mutable state
- Run tests in any order and get the same results

### Test Clarity
- Use descriptive test names that explain what is being tested
- Keep test code simple and readable
- Follow the Arrange-Act-Assert pattern consistently

### Test Coverage
- Aim for meaningful coverage, not just high percentages
- Focus on testing behavior, not code lines
- Cover happy paths, error cases, and edge cases

### Test Maintenance
- Keep tests simple and focused
- Avoid duplicating logic between tests
- Update tests when requirements change
- Remove or fix failing tests promptly

## When TDD Might Not Be Ideal

- **Exploratory prototyping**: When learning or spiking technology, test afterwards
- **UI/UX design**: Visual feedback often better guides design
- **Third-party integrations**: Test the wrapper, not the external service
- **Performance-critical code**: May need benchmarking before TDD

However, even in these cases, tests should eventually be written for production code.