# AGENTS.md - Coding Guidelines for AI Agents

This document provides essential build, test, and coding style guidelines for AI agents working in the Tuff codebase.

## Build & Test Commands

### Running Tests
```bash
# Run all tests (~183 tests, ~0.3s)
mvn test

# Run all tests quietly (suppresses Maven output)
mvn test --quiet

# Run a single test class
mvn test -Dtest=AppTest

# Run a single test method
mvn test -Dtest=AppTest#shouldRunTheSimplestProgramPossible

# Run multiple specific tests
mvn test -Dtest=AppTest#shouldRunWithAnInt,AppTest#shouldRunWith100
```

### Linting & Verification
```bash
# Run checkstyle only
mvn checkstyle:check

# Full build: compile → test → jar → checkstyle
mvn verify

# Check for code duplication (>=65 tokens)
pmd cpd --dir src --language java --minimum-tokens 65 --format markdown

# Check package class count limit (max 15 classes per package)
python check_package_class_limit.py
```

### Pre-commit Validation
The pre-commit hook runs: `mvn test --quiet && mvn verify && pmd cpd --dir src --language java --minimum-tokens 65 --format markdown && python check_package_class_limit.py`

**IMPORTANT: Always run `mvn verify` before committing** to ensure all checks pass locally.

## Git Workflow

**A git commit is mandatory after completing any code changes.** When requested to implement features, fix bugs, refactor code, or make any modifications:

1. Make all code changes
2. Run `mvn verify` to ensure all checks pass
3. Use `git add` and `git commit` with a descriptive message
4. The commit message should summarize the changes and their purpose

Example commit:
```bash
git add src/...
git commit -m "Refactor: extract duplicate code into helper methods

- Extract pushFrame() helper to eliminate 85-token duplication
- Improve maintainability by centralizing stack frame logic"
```

**CRITICAL: Never use `git commit --no-verify` or any flags to skip hooks (`--no-gpg-sign`, etc.) unless explicitly requested by the user.** The pre-commit checks are deliberate and mandatory:
- Tests must pass (183/183)
- Checkstyle must pass (max file 500 lines, max method 50 lines)
- PMD CPD must pass (no duplications >= 65 tokens)
- Package class limits must pass (max 15 classes per package)

Never leave code changes uncommitted. Commits should be created for any meaningful work.

## Code Style Guidelines

### Checkstyle Rules (Strictly Enforced)
- **Max file length**: 500 lines
- **Max method length**: 50 lines (excluding empty lines)
- **Max parameters per method**: 6
- **Max boolean fields per class**: 3
- **Max record components**: 5
- **No code duplication**: >= 65 tokens (PMD CPD enforced)

If you exceed these limits, refactor using the **Processor Pattern** (see below).

### Import Style
- **Group imports**: Project imports first, then Java stdlib (separated by blank line)
- **No wildcard imports**: Use explicit class imports
- **Alphabetical order**: Within each group
- **Fully qualified references**: When avoiding import pollution, use `java.util.function.IntSupplier` inline

Example:
```java
package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.ArrayList;
import java.util.List;
```

### Formatting & Whitespace
- **Indentation**: Tabs (width 4)
- **Line breaks**: Use CRLF on Windows (Git auto-converts; ignore warnings)
- **Braces**: Egyptian style (opening brace on same line)
- **Method calls**: Break parameters across lines when exceeding ~100 chars
- **Blank lines**: Single blank line between methods, double blank line between classes in same file

### Class Structure
```java
public final class ClassName {
	// 1. Private constructor for utility classes
	private ClassName() {
	}

	// 2. Static constants
	private static final long CONSTANT = 42L;

	// 3. Public static methods
	public static Result<T, CompileError> publicMethod(...) {
		...
	}

	// 4. Private static helper methods
	private static void helperMethod(...) {
		...
	}
}
```

### Naming Conventions
- **Classes**: PascalCase (e.g., `ExpressionModel`, `VmExecutor`)
- **Methods**: camelCase (e.g., `parseStatement`, `executeWithIO`)
- **Variables**: camelCase (e.g., `nextMemAddr`, `variableAddresses`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STACK_BASE`, `SP_ADDR`)
- **Packages**: lowercase, descriptive (e.g., `letbinding`, `functions`)
- **Records**: PascalCase with descriptive component names

### Type Annotations
- **Prefer explicit types**: Use `List<Integer>` over `var` for clarity
- **Generic wildcards**: Use `Result<Void, CompileError>` consistently (even if Void is unused)
- **Array types**: `int[]` (not `int arr[]`)
- **Long literals**: Suffix with `L` (e.g., `0L`, `42L`)

### Error Handling (Result<T, X> Pattern)
**Always use Result type** for operations that can fail. Never throw exceptions from compiler/parser code.

```java
// Returning errors
Result<Void, CompileError> storeResult = CompilerHelpers.parseAndStoreInMemory(...);
if (storeResult instanceof Result.Err<Void, CompileError>)
	return storeResult;  // Propagate error

// Checking success
Result<T, CompileError> result = someOperation();
if (result.isErr()) {
	return Result.err(result.errValue());
}
T value = result.okValue();

// Pattern matching (preferred)
return compile(source).match(
	instructions -> VmExecutor.executeWithIO(instructions, input),
	err -> Result.err(new ApplicationError(err))
);
```

### Comments & Documentation
- **Javadoc**: Required for public methods and classes
- **Inline comments**: Explain *why*, not *what*
- **Section headers**: Use `// Section description` for logical groupings
- **TODOs**: Avoid; create GitHub issues instead

Example:
```java
/**
 * Pushes a stack frame with: firstResult(0), n (reg[1]), and a return address.
 * The return address patch index is returned.
 */
private static int pushFrame(List<Instruction> code) {
	// Push frame structure: [ret, n, firstResult] (grows downward)
	addDecrementSP(code);
	...
}
```

### Method Design
- **Single responsibility**: Each method does one thing
- **Static helpers**: Prefer static methods in utility classes
- **Parameter order**: Inputs first, outputs/context last (e.g., `(source, instructions, context)`)
- **Return early**: Use guard clauses to reduce nesting

### Refactoring Patterns

#### Processor Pattern (When Files Exceed 400 Lines)
Extract complex logic into dedicated `*Processor` classes:

```java
// LetBindingHandler.java (main handler)
public static Result<Void, CompileError> handleForLoopAfterLet(...) {
	return ForLoopProcessor.handleForLoopAfterLet(...);
}

// letbinding/ForLoopProcessor.java (extracted logic)
public static Result<Void, CompileError> handleForLoopAfterLet(...) {
	// Complex implementation here
}
```

#### Helper Method Extraction (When Duplicating Code)
If code appears 3+ times or exceeds 50 tokens, extract a helper:

```java
// Before: Duplicated push frame logic
addDecrementSP(st.code);
st.code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
st.code.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
...

// After: Extracted helper
private static int pushFrame(List<Instruction> code) {
	addDecrementSP(code);
	code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
	...
	return patchIndex;
}
```

#### Record Types for Complex Returns
Use records to bundle related data:

```java
public record VariableDecl(String varName, boolean isMutable, String valueExpr) { }

// Usage
VariableDecl decl = parseVariableDecl(stmt, equalsIndex, semiIndex);
String varName = decl.varName();
```

### Testing Patterns

Tests are in `AppTest.java`. Use these helper methods:

```java
@Test
void testName() {
	// Test valid code with expected exit code
	assertValid("let x = 42; x", 42);
	
	// Test with input values
	assertValidWithInput("read U8 + read U8", 15, 10, 5);
	
	// Test compile-time errors
	assertInvalid("let x : U8 = -1");  // Type mismatch
}
```

**Test timeout**: 100ms per test (catches infinite loops automatically)

### Common Pitfalls to Avoid
1. **Don't use wildcard imports**: Always import specific classes
2. **Don't exceed limits**: Run `mvn checkstyle:check` frequently
3. **Don't throw exceptions**: Use `Result<T, CompileError>` instead
4. **Don't modify existing test behavior**: Only add new tests
5. **Don't create files without reading**: Always use Read tool before Edit/Write
6. **Don't skip package limits**: Run `python check_package_class_limit.py` before adding classes

### Package Organization (Max 15 Classes Per Package)
- `io.github.sirmathhman.tuff` - Core types (App, Result, errors, VmExecutor)
- `io.github.sirmathhman.tuff.compiler` - Expression parsing, handlers, builders
- `io.github.sirmathhman.tuff.compiler.letbinding` - Let bindings, functions, structs
- `io.github.sirmathhman.tuff.compiler.functions` - Recursive function compilation
- `io.github.sirmathhman.tuff.vm` - VM execution (Vm, Instruction, Operation, Variant)

When adding new classes, verify package limits pass before committing.

## Additional Resources

- **Architecture details**: See `.github/copilot-instructions.md` for in-depth architecture
- **Recent features**: Consult copilot-instructions.md for newly implemented patterns
- **Pre-commit hooks**: Located in `.husky/pre-commit`
- **Checkstyle config**: See `checkstyle.xml` for full ruleset
