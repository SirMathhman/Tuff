# Session Summary: Type System Analysis & Architecture Planning

## What Was Accomplished

### 1. Identified the Root Cause ✅

**Problem**: `extern fn malloc<T>(size: USize): *mut [T];` generates incorrect C++

```cpp
T* const data = malloc<int32_t>(100);  // WRONG - T is unbound!
```

Should generate:

```cpp
int32_t* const data = malloc(100);  // RIGHT - no template, proper substitution
```

**Root Cause**: The compiler's type system uses `std::string` instead of proper AST nodes, causing:

- Loss of semantic information (can't tell `T` from `I32` in a string)
- Fragile generic substitution (string replacement instead of unification)
- Brittle codegen (re-parsing type strings instead of traversing AST)

### 2. Partial Fix Implemented ✅

Added temporary metadata tracking to prevent emitting template args for extern functions:

- Added `FunctionInfo.isExtern` flag
- Added `ASTNode.calleeIsExtern` flag
- Modified codegen to skip `<I32>` for extern calls

**Status**: This is a **WIP band-aid**, not a complete solution. It prevents the immediate error but doesn't generate correct code because type substitution still fails.

### 3. Comprehensive Migration Plan Created ✅

Created `docs/ARCHITECTURE_MIGRATION.md` outlining a complete 4-phase solution:

**Phase 1: Build Foundation** (2-3 days)

- Complete `expr.h` with all type representations
- Implement `TypeEnvironment` for type substitution
- Create proper type structures with `ExprPtr`

**Phase 2: Rewrite Type Checker** (2-3 days)

- Convert all type information to use `ExprPtr` instead of strings
- Implement proper generic instantiation with unification
- Update `checkCallExpr`, `checkFunctionDecl`, etc.

**Phase 3: Rewrite Codegen** (2-3 days)

- Create `TypeCodegen` class to convert `ExprPtr` to C++/JS
- Update CALL_EXPR, LET_STMT, and all expression generation
- Fix malloc<T> to generate `int32_t* data = malloc(100);`

**Phase 4: Cleanup** (1-2 days)

- Remove all string-based type references
- Remove deprecated functions like `mapType()`

**Total Effort**: ~1 week of focused work

### 4. Key Insights ✅

**Why This Matters:**
The current hybrid system (strings + `ExprPtr`) is fundamentally broken because:

1. Type information is duplicated and inconsistent
2. Semantic information is lost when types become strings
3. Generic substitution can't properly track type variables
4. Codegen can't generate correct code without proper type information

**Why It's Worth Doing:**
This migration unblocks:

- Correct generic extern functions (malloc<T>)
- Type bounds on generics (`fn<T: USize>`)
- Function types as first-class values
- Literal types (`5I32` vs `I32`)
- Proper type inference
- Better error messages

## Current State

### What Works

- Basic types and primitives
- Generic functions (without extern)
- Generic structs
- Type checking with string-based types
- Codegen for concrete types

### What's Broken

- Generic extern functions (malloc<T>)
- Return type substitution for generics
- Type semantics in codegen

### What's Deferred (Temporary WIP)

- Extern function metadata (in commit `9d6a44a`)
- Proper type substitution (blocked by string-based system)

## Commits Made This Session

1. **9d6a44a** - WIP extern function metadata (partial fix)
2. **94073a2** - Clarification on extern codegen (documentation)
3. **f177b24** - Architecture migration plan (comprehensive solution)

## Next Steps When Ready

1. Create feature branch: `git checkout -b feature/type-system-migration`
2. Follow the 4-phase plan in `docs/ARCHITECTURE_MIGRATION.md`
3. Test at each phase to ensure no regressions
4. Keep commits small and logical for easy review

## Technical Debt Tracker

| Item                     | Severity | Blocker | Phase |
| ------------------------ | -------- | ------- | ----- |
| String-based types       | Critical | Yes     | 1-4   |
| Generic extern functions | High     | No      | 3     |
| mapType() function       | Medium   | No      | 4     |
| No TypeEnvironment       | Critical | Yes     | 1     |
| String substitution      | Critical | Yes     | 2     |
| Codegen parsing types    | High     | No      | 3     |

## Architecture Decision

**Decision**: Type information will flow as `ExprPtr` throughout the compiler:

- Lexer → Parser → TypeChecker → Codegen
- No intermediate string conversions
- Single source of truth for types

This follows best practices from established compilers (Rust, Go, Kotlin).
