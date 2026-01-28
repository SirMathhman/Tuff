# Bootstrap Plan: Stage 0 → Stage 1 Transition

This document outlines the strategy for gradually transitioning the Tuff compiler from TypeScript (Stage 0) to self-hosting (Stage 1).

## Why This Approach?

Traditional compiler bootstraps (Stage 0 in a lower-level language → Stage 1 written in itself) are risky:
- Bugs in Stage 0 become hard to find and fix
- No reference implementation to validate behavior
- Performance optimization is deferred, hinders early dogfooding
- Single-point-of-failure if Stage 0 has fundamental issues

Our **incremental component-by-component** approach is safer:
- Each component rewritten in Tuff is thoroughly tested against TypeScript version
- Gradual feature adoption catches issues early
- TypeScript version serves as executable specification
- Can switch between versions for debugging

## Phase Timeline

### Stage 0: Feature Completion (Months 1-4)
- ✓ Lexer complete and tested
- ✓ Parser complete with expression, declaration, statement support
- ✓ Analyzer with type checking and symbol resolution
- ✓ Codegen producing valid TypeScript
- All language features specified in [LANGUAGE.md](./LANGUAGE.md) fully implemented
- Extensive test suite (50+ test cases per phase)
- Compiler can compile moderately complex programs
- **No-Panic Guarantee**: Analyzer enforces compile-time checks ensuring all Tuff code is crash-free at runtime
- **Deliverable**: `tuff --version 0.1.0` - self-compiling for basic programs

### Stage 1a: Lexer Rewrite (Month 5)
- [ ] Implement Tuff lexer in Tuff itself
- [ ] Validate output against TypeScript lexer (both lexing same test inputs)
- [ ] Performance testing: ensure Tuff lexer meets performance requirements
- [ ] Compile Tuff lexer.tuff → TypeScript via Stage 0
- [ ] Integrate Tuff lexer into compiler binary
- **Testing**: Fuzz testing with random input, edge cases
- **Rollback**: Use TypeScript lexer if issues found
- **Deliverable**: Compiler with hybrid TS/Tuff phases

### Stage 1b: Parser Rewrite (Month 6)
- [ ] Implement Tuff parser in Tuff (using Tuff lexer output)
- [ ] Build recursive descent parser in Tuff
- [ ] Validate AST output matches TypeScript parser
- [ ] Integrate into compiler
- **Considerations**: Parser has higher complexity, more room for bugs
- **Testing**: AST equivalence tests, grammar coverage tests
- **Deliverable**: ~50% compiler written in Tuff

### Stage 1c: Analyzer Rewrite (Month 7-8)
- [ ] Implement type system in Tuff
- [ ] Build symbol table and resolver
- [ ] Implement type checking rules
- [ ] Handle generic types and trait resolution
- **Challenge**: Most complex phase, requires care with scope rules
- **Action**: Incremental feature adoption (start with basic types, add generics later)
- **Testing**: Type equivalence tests, symbol table invariant checks

### Stage 1d: Codegen Rewrite (Month 9)
- [ ] Implement TypeScript emission in Tuff
- [ ] Test output matches current codegen
- [ ] Optimize for readability/performance
- **Final stage**: Only codegen left in TypeScript at this point

### Stage 1: Complete Self-Hosting (Month 10+)
- [ ] All compiler phases written in Tuff
- [ ] Compiler bootstraps itself: `tuff build compiler/*.tuff → TypeScript → Run to compile Tuff code`
- [ ] Performance optimization opportunities:
  - Compile to native binary (via Deno or Bun's bundler)
  - Inline hot paths identified via profiling
  - Parallel compilation phases

## Testing & Validation Strategy

### Regression Testing
After each phase rewrite:
1. Compile same test inputs with both versions
2. Compare outputs (AST for parser, TypeScript for codegen)
3. Report differences
4. Fix until outputs match

### Property-Based Testing
- Lexer: "Tokenized → Detokenized should equal input"
- Parser: "Parsed → Pretty-printed → Parsed should be equivalent"
- Analyzer: "All defined symbols should be resolvable"
- Codegen: "Generated TypeScript should be valid and runnable"

### Performance Benchmarks
- Track compilation time for standard test suite
- Memory usage during compilation
- Output code size

### Compatibility Matrix
Maintain test suite running against both versions:

```
Input Code → [TS Lexer] → TS Parser → TS Analyzer → TS Codegen → Output A
Input Code → [Tuff Lexer (compiled to TS)] → ... → Output B
Output A === Output B ✓
```

## Risk Mitigation

### If a Tuff phase has bugs:
1. Automatically flag and use TypeScript version instead
2. Report as compiler warning to user
3. Create minimal test case reproducing bug
4. Fix bug in Tuff source
5. Re-enable once fixed

### If Tuff compiler itself is broken:
- Keep previous stable Stage 0 binary
- Use for bootstrapping new Stage 0 build
- Gradual rollout of new features

### Fallback strategy:
```bash
# Worst case: revert to pure TypeScript
git revert <merge-commit-tuff-phase>
bun run build  # Rebuilds with TypeScript
```

## Compiler Versions

After each major phase, increment version:

- `v0.1.0` - Stage 0 complete (pure TypeScript)
- `v0.2.0` - Tuff lexer integrated
- `v0.3.0` - Tuff parser integrated
- `v0.4.0` - Tuff analyzer integrated
- `v0.5.0` - Tuff codegen integrated
- `v1.0.0` - Stage 1 complete, self-hosting

Each version is tagged and released on GitHub with changelog.

## Feature Lock During Rewrite

**Important**: During any phase rewrite, **no new language features are added** to prevent invalidating assumptions in other phases.

New features are queued for next version:

```
v0.2.0: Stabilize after lexer rewrite
v0.2.1-v0.2.9: Add features while lexer stable
v0.3.0: Start parser rewrite (no feature additions)
```

## Self-Hosting Ceremony

Once Stage 1 complete, compile the compiler with itself:

```bash
# Stage 0 (TypeScript)
bun run build  # Outputs dist/ with TypeScript

# Stage 1a (Hybrid)
./dist/tuff build src/lexer/*.tuff && node dist/lexer/*.js ...

# Stage 1 (Full self-hosting)
rm dist/
./tuff build src/*.tuff  # Bootstraps compiler using itself
./dist/tuff build examples/hello.tuff  # Self-compiled compiler compiles Tuff code
```

This is a significant milestone worth documenting and announcing!

## Metrics

Track throughout Stage 1:

| Metric | Target | Method |
|--------|--------|--------|
| Test pass rate | 100% | Daily test runs |
| Output equivalence | 100% | Regression test suite |
| Compilation time | <1s for stdlib | Benchmark suite |
| Memory usage | <100MB typical | vmmap/heaptrack |
| Code coverage | >85% | Coverage instrumentation |

## Post Stage 1 Roadmap

Once self-hosting achieved:

1. **Optimization phase**: Profile and optimize hot paths
2. **Standard library**: Build stdlib in Tuff (math, collections, I/O)
3. **Tooling**: Implement formatter, linter, LSP
4. **Native compilation**: Compile to native binary (via LLVM or C backend)
5. **Community**: Release for general use, gather feedback
6. **Language evolution**: Add features based on user feedback

## Contributing During Bootstrap

For contributors during Stage 1:

1. **New phases**: Write in TypeScript first, test thoroughly
2. **Existing phases**: Test manually before submitting PRs
3. **Bug reports**: Always specify which version has the bug
4. **Regression testing**: Required for phase rewrites
5. **Documentation**: Update architecture docs as phases change

## Success Criteria

Stage 1 is considered complete when:
- ✓ All compiler phases written in Tuff
- ✓ Compiler compiles itself successfully
- ✓ No regression in output quality or performance
- ✓ All test cases pass with self-hosted version
- ✓ Version bumped to v1.0.0
- ✓ Release announced with migration guide
