# File Size Refactoring Plan

## Overview

The 500-line file limit linting rule has been implemented. The following files exceed this limit and need refactoring:

| File                   | Lines | Over by |
| ---------------------- | ----- | ------- |
| analyzer.tuff          | 2484  | 1984    |
| parsing/expr_stmt.tuff | 2100  | 1600    |
| tuffc_lib.tuff         | 1792  | 1292    |
| parsing/decls.tuff     | 801   | 301     |
| emit/ast_js.tuff       | 688   | 188     |
| ast.tuff               | 528   | 28      |

## Refactoring Strategy

### Phase 1: ast.tuff (528 → <500 lines)

**Priority: Low** (only 28 lines over)

- Consider moving type aliases or helper functions to a separate file
- Or accept this as a canonical AST definitions file that can exceed the limit slightly

### Phase 2: emit/ast_js.tuff (688 → <500 lines)

**Priority: Medium**

- Split by node type: expressions, statements, declarations
- Possible split:
  - `emit/expr_js.tuff` - expression emission
  - `emit/stmt_js.tuff` - statement emission
  - `emit/decl_js.tuff` - declaration emission
  - `emit/ast_js.tuff` - main orchestrator

### Phase 3: parsing/decls.tuff (801 → <500 lines)

**Priority: Medium**

- Split by declaration type:
  - `parsing/decl_fn.tuff` - function declarations
  - `parsing/decl_struct.tuff` - struct/class declarations
  - `parsing/decl_import.tuff` - import declarations
  - `parsing/decls.tuff` - orchestrator

### Phase 4: tuffc_lib.tuff (1792 → <500 lines)

**Priority: High**

- This is the main compiler facade
- Split by phase:
  - `compile/module_graph.tuff` - module discovery and ordering
  - `compile/compile.tuff` - compilation logic
  - `compile/lint.tuff` - linting logic
  - `compile/lsp.tuff` - LSP integration
  - `tuffc_lib.tuff` - minimal facade

### Phase 5: parsing/expr_stmt.tuff (2100 → <500 lines)

**Priority: High**

- Split by expression/statement type:
  - `parsing/expr_primary.tuff` - literals, identifiers
  - `parsing/expr_binary.tuff` - binary operators
  - `parsing/expr_control.tuff` - if/while/loop/match
  - `parsing/expr_call.tuff` - function calls, method calls
  - `parsing/stmt.tuff` - statements
  - `parsing/expr_stmt.tuff` - orchestrator

### Phase 6: analyzer.tuff (2484 → <500 lines)

**Priority: High**

- Split by analysis phase:
  - `analyzer/types.tuff` - type checking logic
  - `analyzer/scope.tuff` - scope management, shadowing
  - `analyzer/usage.tuff` - unused variable tracking
  - `analyzer/calls.tuff` - function call validation
  - `analyzer/patterns.tuff` - pattern matching validation
  - `analyzer.tuff` - orchestrator

## Implementation Notes

1. **Preserve exports**: When splitting, ensure all public (`out`) functions remain accessible
2. **Test after each split**: Run full test suite after each file split
3. **Update prebuilt**: Run `npm run build:selfhost-prebuilt` after each successful split
4. **Handle circular dependencies**: Some splits may require careful import ordering

## Acceptance Criteria

- [ ] All files under 500 lines
- [ ] All 94+ tests pass
- [ ] Prebuilt compiler regenerates successfully
- [ ] Self-hosting verification (Stage 3 == Stage 4) passes
