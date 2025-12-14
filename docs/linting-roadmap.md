# Tuff Linter Roadmap

## Overview

The Tuff analyzer currently performs **20+ error checks** (type safety, shadowing, exhaustiveness, etc.) but minimal **warnings** for code quality. This document outlines linting enhancements to improve code quality detection.

## Current State

### Existing Error Checks ✅

- Shadowing & duplicate declarations
- Type mismatches & unknown identifiers
- Function arity & generic type argument validation
- Missing parameter type annotations (functions, class fns, and lambdas)
- Array bounds & initialization
- Union narrowing & exhaustiveness checking
- Immutability violations
- Condition type checking

### Minimal Warnings ⚠️

- Short identifier detection (mostly disabled in tests)
- Deprecation markers via comments (warns on both import and usage)
  - `// deprecated - <reason>`
  - `/* deprecated - <reason> */`

---

## Proposed Linting Rules

### Phase 1 (High Priority)

These catch common mistakes that compile but are likely bugs.

#### 1. **Unused Local Variables**

- **Category**: Warning
- **Scope**: Local variables declared but never read
- **Example**:
  ```tuff
  fn demo() : I32 => {
    let x = 10;  // ⚠️ x is never used
    let y = 20;
    y
  }
  ```
- **Implementation**: Track variable usage in scope analysis
- **Notes**: Exclude pattern `_` variables (deliberate ignores)

#### 2. **Dead Code After Unconditional Returns/Breaks**

- **Category**: Warning
- **Scope**: Unreachable statements after unconditional jumps
- **Example**:
  ```tuff
  fn demo() : I32 => {
    if (x) return 1 else return 2;
    let y = 10;  // ⚠️ unreachable
    y
  }
  ```
- **Implementation**: Track control flow, flag statements after unconditional jumps
- **Notes**: Handle all jump types (return, break, continue)

#### 3. **Unused Function Parameters**

- **Category**: Warning
- **Scope**: Parameters never referenced in function body
- **Example**:
  ```tuff
  fn process(x: I32, unused: String) : I32 => x + 1  // ⚠️ unused
  ```
- **Implementation**: Reuse unused variable detection on function scope
- **Notes**: Exclude `_` prefix for deliberate ignores

#### 4. **Redundant Type Annotations**

- **Category**: Warning (informational)
- **Scope**: Explicit types where inference would work fine
- **Example**:
  ```tuff
  let x: I32 = 42;  // ⚠️ type can be inferred
  ```
- **Implementation**: Check if annotation matches inferred type exactly
- **Notes**: Skip if annotation is necessary for function signatures or generics

### Phase 2 (Medium Priority)

These improve clarity and catch style issues.

#### 5. **Unreachable Match Arms**

- **Category**: Warning
- **Scope**: Match arms that will never execute due to earlier constant patterns
- **Example**:
  ```tuff
  match (x) {
    1 => "one",
    1 => "one again",  // ⚠️ unreachable (duplicate)
    _ => "other"
  }
  ```
- **Implementation**: Track literals/constructors in match analysis
- **Notes**: Include duplicate constructor detection

#### 6. **Missing Explicit Return**

- **Category**: Error/Warning (configurable)
- **Scope**: Functions with return type but no explicit return
- **Example**:
  ```tuff
  fn getValue() : I32 => {
    let x = 10;  // ⚠️ block has no value, but return type is I32
  }
  ```
- **Implementation**: Type analysis already validates this; surface as warning
- **Notes**: Currently a type error; consider softening to warning with suggestion

#### 7. **Mutable Binding Never Reassigned**

- **Category**: Informational
- **Scope**: `let mut` variables never assigned after initialization
- **Example**:
  ```tuff
  let mut x = 10;  // ℹ️ could be `let x = 10`
  print(x);
  ```
- **Implementation**: Track assignments per variable
- **Notes**: Skip if passed by mutable ref to function

#### 8. **Overly Short Identifiers**

- **Category**: Warning (severity configurable)
- **Scope**: Single-letter variables except in loops/standard contexts
- **Example**:
  ```tuff
  let q = process_data();  // ⚠️ unclear intent
  ```
- **Implementation**: Re-enable with better filtering (loop counters, math, test context)
- **Notes**: Allow `x`, `y`, `z` in math; `i`, `j` in loops; ignore in test files

### Phase 3 (Lower Priority)

These are nice-to-haves for specific patterns.

#### 9. **Nested Function Without Captured Locals**

- **Category**: Informational
- **Scope**: Local function that doesn't use outer scope
- **Example**:
  ```tuff
  let f = fn(x: I32) : I32 => x + 1;  // ℹ️ could be module-level
  ```
- **Implementation**: Check closure capture analysis
- **Notes**: Suggest moving to module scope for clarity

#### 10. **Constant Condition Branches**

- **Category**: Warning
- **Scope**: `if (true)` or `if (false)` conditions
- **Example**:
  ```tuff
  if (true) doSomething() else doOther();  // ⚠️ always takes first branch
  ```
- **Implementation**: Constant folding in condition analysis
- **Notes**: Useful for generated code debugging

---

## Implementation Strategy

### Order of Implementation

1. **Phase 1.1**: Unused local variables (highest ROI, simplest)
2. **Phase 1.2**: Dead code after unconditional jumps
3. **Phase 1.3**: Unused function parameters
4. **Phase 2.1**: Unreachable match arms
5. **Phase 2.2**: Mutable bindings never reassigned
6. **Phase 3+**: Remaining rules as capacity allows

### Testing Approach

- Add `.test.tuff` files for each rule (e.g., `linting_unused_vars.test.tuff`)
- Add TypeScript tests in `src/test/ts/` that capture diagnostics and validate warnings
- Test edge cases: closures, match patterns, generic functions

### Configuration

- Add `diagnostic.level` or similar to control warning/error elevation
- Consider `.tuffrc` or similar for per-project settings
- Suppress via `@suppress` comments or `_` prefix conventions

---

## Notes

- All warnings should suggest actionable fixes (e.g., "remove unused variable" or "use `let` instead of `let mut`")
- Maintain performance: linting checks should not significantly slow compilation
- Prioritize common real-world patterns (unused vars) over edge cases
- Keep messages concise and actionable per Tuff style
