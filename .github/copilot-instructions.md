# AI Coding Agent Instructions for Tuff

## Project Overview

**Tuff** is a typed expression interpreter (src/utils/interpret.ts) that evaluates code with a sophisticated type system, functions with lambda support, and control flow (loops, conditionals, match expressions).

## Architecture & Data Flow

### Core Execution Pipeline

1. **Entry Point**: `src/utils/interpret.ts` → `interpretWithScope()` in src/app.ts
2. **Processing Order** (src/app.ts dispatches in sequence):
   - Type declarations → Struct declarations → Function declarations
   - Variable declarations → Match/Loop/While/For expressions
   - Variable assignments → Function calls → Binary operations
3. **Data Structures** passed through chain:
   - `scope: Map<string, number>` - variable values (all values are numbers)
   - `typeMap: Map<string, number>` - variable type sizes (extracted by extractTypeSize)
   - `mutMap: Map<string, boolean>` - mutability flags
   - `functionDefs: Map<string, FnDef>` - function definitions (internal to src/functions.ts)
   - Uninitialized sets for tracking first assignments

### Type System

- **Encoding**: All values are `number`; types determine size/validation
- **Type Sizes**: `extractTypeSize()` returns: Bool=1, I32=32, U8=8, U16=16, U32=32, U64=64, etc.
- **Aliases**: Stored in typeMap with prefix `"__alias__"` + name
- **Unions**: Stored with prefix `"__union__"` + name
- **Function Types**: Encoded as `-2` in typeMap; signatures like `(I32, I32) => I32` stored in `typeStr` field
- **Special Types**:
  - Type `-2`: Function parameter (requires special handling in parseFunctionCall)
  - Default return type for functions: I32 (32) if not specified

### Functions & Lambdas (Recent Feature)

- **Regular Functions**: `fn name(param : Type) : ReturnType => body;`
- **Function Parameters**: Declared as `param : (TypeA, TypeB) => ReturnType`
- **Anonymous Functions**: Created with `(param : Type) : ReturnType => expr` when passed to function parameters
- **Lambda Registration**: Via `registerAnonymousFunction()` in src/handlers/anonymous-functions.ts
  - Returns `{ name: string; def: AnonymousFnDef }` tuple
  - Name format: `__anon_${Date.now()}_${random}`
  - Must be registered in functionDefs map to be callable

## Critical Project Constraints

### File Organization Rules (Pre-commit Validation)

- **Max 8 TypeScript files per directory** - checked by `bun ./tools/check-dir-structure.ts`
- **Subdirectory-specific limits**: src/expressions (4), src/loops (4), src/handlers (2), src/types (2), src/utils (3)
- **Max 200 lines per file** (ESLint max-lines rule, skipComments/skipBlankLines)
  - Violates trigger auto-extraction of logic to new files
  - Run `npm run lint:fix` to check violations

### Code Quality Rules (ESLint enforced)

- ✅ No RegExp allowed (parse strings manually)
- ✅ No `null` (use `undefined` instead)
- ✅ No unused variables (prefix with `_` if intentional)
- ✅ Type-safe imports required
- ⚠️ Circular dependencies checked: `npm run check:circular`
- ⚠️ Code duplication: CPD checks minimum 60 tokens with ignoreIdentifiers/Literals

### Pre-Commit Hooks (husky / .husky)

Runs automatically on git commit:

1. Tests (bun test)
2. CPD code duplication check
3. Prettier formatting
4. ESLint + TypeScript compilation
5. Circular dependency check
6. Directory structure validation
7. Subdirectory dependency validation
8. Dependency graph visualization

## Key File Locations by Concern

| Concern                       | Files                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Type System**               | src/type-utils.ts (extractTypeSize, validateUnsignedValue)                                            |
| **Function Handler**          | src/functions.ts (exports functionDefs, setFunctionRef, isFunctionType)                               |
| **Anonymous Functions**       | src/handlers/anonymous-functions.ts (registerAnonymousFunction, AnonymousFnDef)                       |
| **Function Declaration**      | src/handlers/function-declaration.ts (createFunctionDeclarationHandler)                               |
| **Function Type Annotations** | src/function-type-handler.ts (handleFunctionTypeAnnotation)                                           |
| **Variable Scope**            | src/scope.ts (handleVarDecl - imports functionDefs from functions.ts)                                 |
| **Control Flow**              | src/match.ts, src/loops/{loop,while,for}.ts                                                           |
| **Expressions**               | src/expressions/handlers.ts (if/else, assignment), binary-operation.ts                                |
| **Grouped Expressions**       | src/expressions/grouped-expressions.ts (evaluateGroupedExpressionsWithScope - skips lambdas)          |
| **Parsing**                   | src/parser.ts (parseTypedNumber), function-utils.ts (isFunctionType, splitParametersRespectingParens) |

## Essential Workflows

### Adding Features

1. Write test(s) in appropriate `tests/{feature}.test.ts`
2. Run `npm test` to verify failure
3. Implement in corresponding src/ file
4. If implementation > 200 lines, extract helpers to utils/ or create new handler
5. Run full validation: `npm run lint && npm test`
6. Verify pre-commit checks pass: `git add . && git commit -m "..."`

### Testing Split

- **tests/arithmetic.test.ts**: 16 tests for operations & types
- **tests/variables.test.ts**: 20 tests for declarations & assignments
- **tests/control-flow.test.ts**: 14 tests for conditionals & loops
- **tests/types.test.ts**: 4 tests for type aliases, unions, structs
- **tests/functions.test.ts**: 5 tests for functions & lambdas (CRITICAL: lambda parameter support)
  Total: 56 tests across 5 files

### Common Commands

```bash
npm test                    # Run all tests
npm run lint               # TypeScript + ESLint check
npm run lint:fix           # Auto-fix formatting
npm run check:circular     # Detect circular imports
npm run check:structure    # Verify directory limits
npm run check:subdir-deps  # Verify no cross-subdirectory cycles
npm run visualize          # Generate dependency graph to docs/images/graph.svg
npm run cpd                # Detect code duplication (PMD)
```

## Integration Points & Cross-Component Communication

### Function Flow Diagram

```
parseFunctionCall (src/functions.ts)
  ├─ If param type == -2 (function type):
  │  ├─ Call registerAnonymousFunction() [src/handlers/anonymous-functions.ts]
  │  ├─ Register result in functionDefs map
  │  └─ Set functionRef mapping for param name
  └─ Evaluate args and merge into fn scope

handleFunctionTypeAnnotation (src/function-type-handler.ts)
  ├─ Called from scope.ts for `let var : (Type) => Type` declarations
  ├─ Calls registerAnonymousFunction for lambda RHS
  ├─ Registers in functionDefs map
  └─ Sets functionRef for variable name
```

### Special Type Resolution

- Function type annotation detection: `isFunctionType(typeStr)` checks if string matches `(...)=>...` pattern
- Return type extraction: `extractReturnTypeFromFunctionType(typeStr)` parses `(Params) => ReturnType`
- Parameter splitting respects nested parens: `splitParametersRespectingParens()`

### Scope Chain

Variables resolved in order: 1) Local scope 2) functionRefs mapping (for lambda parameters) 3) Error if not found

## Deployment & Package Info

- **Entry Point**: ./src/utils/interpret.ts (defined in package.json)
- **Exports**: "." and "./interpret" both point to interpret.ts
- **Type Module**: Configured as ES module ("type": "module")
- **Files Included**: Only src/ directory (via "files" field) - tests/ excluded from distribution

## High-Risk Areas for AI Agents

1. **Function Parameter Handling**: Type -2 requires special path through registerAnonymousFunction + functionRefs
2. **Return Type Inference**: Lambda args to functions need extractTypeFromFunctionType for correct signature
3. **Import Path Changes**: Moving files requires updating relative imports (e.g., handlers/anonymous-functions.ts uses ../type-utils)
4. **Line Count Violations**: New features often exceed 200 lines → plan extraction upfront
5. **Directory Structure**: Adding >8 files to any directory breaks pre-commit (move items to new subdirectory instead)
6. **Circular Dependencies**: src/scope.ts imports functionDefs from functions.ts, functions.ts exports registerAnonymousFunction from handlers/

## Documentation References

- Type extraction: src/type-utils.ts (extractTypeSize patterns)
- Function definitions: src/functions.ts FnDef type definition
- Anonymous functions: src/handlers/anonymous-functions.ts AnonymousFnDef type
- Module resolution: package.json exports field for public API
- Quality gates: package.json scripts section for all checks
