# Detailed AST Migration Plan

## Philosophy
- **No new files created** - refactor existing files in place
- **Parallel execution** - old and new code coexist during transition
- **Small commits** - each phase is a single, testable commit
- **Test-driven** - all 126 tests pass after each phase
- **Backward compatibility** - public APIs unchanged until final phase

## Timeline Overview

**Total: 8 weeks, 8 phases**

| Phase | Focus | Duration | Files Modified |
|-------|-------|----------|-----------------|
| 1 | AST Type Definitions | Week 1 | parser.ts |
| 2 | String Tokenizer | Week 1-2 | parser.ts |
| 3 | Token-to-AST Parser | Week 2-3 | parser.ts |
| 4 | AST Statement Dispatch (Let) | Week 3-4 | interpret/statements.ts |
| 5 | Migrate All Statement Types | Week 4-5 | interpret/statements.ts |
| 6 | Expression Evaluator | Week 5-6 | eval/expressions.ts |
| 7 | Remove Old String Parsing | Week 6-7 | all files |
| 8 | Final Cleanup & Benchmark | Week 7-8 | all files |

## Phase 1: Type Definitions

Add AST types to parser.ts (no behavior change).

**What gets added:**
- Statement union (Let, If, While, For, Fn, Struct, etc.)
- Expression union (Binary ops, Calls, Literals, etc.)
- All types include position field for error reporting

**Test:** npm test → 126/126 passing
**Commit:** 'feat: add AST type definitions'

## Phase 2: Tokenizer

Add tokenize() function to parser.ts.

**What gets added:**
- Token types (Keyword, Identifier, Literal, Operator, etc.)
- tokenize(string): Token[] function
- Position tracking for all tokens

**Test:** npm test → 126/126 passing
**Commit:** 'feat: add tokenizer'

## Phase 3: Parser

Add parseProgram() and TokenParser class to parser.ts.

**What gets added:**
- parseProgram(string): ASTNode[] entry point
- TokenParser class with statement/expression parsers
- Full recursive descent parser for all language constructs

**Test:** npm test → 126/126 passing (parser unused)
**Commit:** 'feat: add token-to-AST parser'

## Phase 4: AST Statement Dispatch

Add interpretASTStatement() to interpret/statements.ts.

**Strategy:** Create dual-path dispatch
- If statement is 'let', use AST path
- Else, use old string path
- Gradually enable more statement types

**What gets modified:**
- interpret/statements.ts: Add interpretASTStatement() + statement-specific handlers
- Add shouldUseAST(stmt: string): boolean guard
- Add astToString() bridge function (temporary)

**Test:** npm test → 126/126 passing
**Commit:** 'feat: add AST-based let statement handling'

## Phase 5: Migrate All Statement Types

Repeat Phase 4 pattern for each statement type.

**Order of migration (simplest first):**
1. expression (trivial)
2. yield (simple)
3. if / else-if / else (moderate)
4. while (moderate)
5. for (complex range parsing)
6. assignment (replace assignment_parser.ts)
7. fn (complex, replace parseFnComponents)
8. struct (uses parseStructDef)
9. type alias (simple)
10. import / extern (moderate)

**Each sub-phase:**
- Add interpretASTX() function
- Update shouldUseAST() to include new pattern
- Commit + test
- Total: 10 commits, ~50 lines each

## Phase 6: Expression Evaluator

Replace string-based expression evaluation with AST visitor.

**What gets modified:**
- eval/expressions.ts: Add evaluateASTExpression()
- Implement visitor pattern for all expression types
- Replace expandParensAndBraces() usage gradually

**Test:** npm test → 126/126 passing
**Commit:** 'feat: add AST expression evaluator'

## Phase 7: Remove Old Code

Delete deprecated string parsing functions.

**What gets removed:**
- control_flow_parser.ts (entire file can be deleted)
- assignment_parser.ts (entire file can be deleted)
- String parsing utilities from interpret/parsing.ts
- expandParensAndBraces() from eval/expressions.ts
- extractAssignmentParts() from assignment_parser
- astToString() bridge function

**What gets updated:**
- if_handlers.ts → use interpretASTIf()
- loop_handlers.ts → use interpretASTWhile()
- assignment_statement.ts → use interpretASTAssignment()

**Test:** npm test → 126/126 passing
**Commit:** 'refactor: remove old string-based parsing'

## Phase 8: Final Cleanup

Polish and benchmark.

**What changes:**
- Remove dual-path dispatch, AST is primary
- Add proper error messages with position info
- Simplify interpret.ts entry point
- Update module documentation

**Benchmarks:**
- Performance: AST path vs string path
- Memory: AST nodes vs tokenization overhead
- Lines of code: ~400 lines removed

**Final commit:** 'refactor: complete AST migration'

## Expected Outcomes

| Metric | Before | After | Benefit |
|--------|--------|-------|---------|
| String parsing code | ~400 lines | ~0 | Better maintainability |
| Type safety | Loose (string-based) | Strong (typed AST) | Fewer runtime errors |
| Error messages | Line-level | Position-level | Better debugging |
| Feature additions | String parsing logic | AST visitors | Faster iteration |
| Performance | Baseline | TBD | Likely faster |

## Risk Mitigation

- **Dual-path dispatch**: Old code always available as fallback
- **Test after each phase**: All 126 tests passing continuously
- **CPD monitoring**: Ensure no duplication creeps in
- **Small commits**: Easy to revert if issues arise
- **Git history**: Clear trail of refactoring decisions

## Success Criteria

- [x] Phase 1: AST types defined
- [ ] Phase 2: Tokenizer working
- [ ] Phase 3: Parser can parse programs
- [ ] Phase 4: Let statements use AST
- [ ] Phase 5: All statements use AST
- [ ] Phase 6: Expressions evaluated via AST
- [ ] Phase 7: Old code removed
- [ ] Phase 8: Final cleanup complete
- [ ] 126/126 tests passing throughout
- [ ] CPD violations: 0
- [ ] No breaking changes to public API

