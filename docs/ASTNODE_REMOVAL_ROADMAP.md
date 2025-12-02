w# Roadmap: Removing ASTNode Dependency

## Current Architecture

```
Parser (ASTNode)
   ↓
TypeChecker (ASTNode → adds inferredType, exprType)
   ↓
CodeGenerator:
   - Old path: generateNode(ASTNode) → uses mapType, parseType, etc.
   - New path: genExpr/genStmt/genDecl/genType (typed AST)
   ↓
ASTConverter (bridges gap)
   - toExpr(ASTNode) → ExprPtr
   - toStmt(ASTNode) → StmtPtr
   - toDecl(ASTNode) → DeclPtr
   - toType(ASTNode) → TypePtr
```

## Dependencies on ASTNode

### 1. Parser (CRITICAL - ~900 lines)

- **Current**: Produces `shared_ptr<ASTNode>` for all nodes
- **Why hard**:
  - Lexer and Parser are tightly coupled to ASTNode structure
  - 50+ parse functions return ASTNode
  - Generic parameter handling baked into ASTNode
  - Type node representation intertwined with AST
- **Work needed**: Complete rewrite of parser output layer
- **Estimate**: 2000+ lines of new code

### 2. TypeChecker (CRITICAL - ~1500 lines)

- **Current**: Takes `shared_ptr<ASTNode>`, mutates with inferredType/exprType
- **Why hard**:
  - Adds data to ASTNode during pass 2 (type inference)
  - Resolves types to ExprPtr
  - Uses children vector heavily for tree traversal
  - 15+ check functions all take ASTNode
- **Work needed**:
  - Create TypeChecker that works on typed AST OR
  - Keep TypeChecker as-is but feed it better input
  - Create typed AST builder from ASTNode
- **Estimate**: 1500+ lines of refactoring

### 3. CodeGenerator - Old Path (DEPRECATING)

- **Current**: ~500 lines of old string-based generation
- **Used by**: FUNCTION_DECL, ACTUAL_DECL, MODULE_DECL, BLOCK, and various expressions
- **Work needed**:
  - Migrate FUNCTION_DECL/ACTUAL_DECL to typed path (need implicit return logic)
  - Migrate MODULE_DECL to typed path
  - Delete old path once complete
- **Estimate**: 200 lines of new code

### 4. ASTConverter (BRIDGE - ~410 lines)

- **Current**: Takes ASTNode, produces typed AST
- **Purpose**: Allows gradual migration while both systems coexist
- **Can be removed**: Only after Parser/TypeChecker fully rewritten
- **Estimate**: Will disappear entirely (net zero)

## Realistic Removal Strategy

### Phase 1: Complete CodeGenerator Migration (CURRENT)

- ✅ Migrate simple declarations (STRUCT, ENUM, USE, EXPECT)
- ✅ Migrate all expressions
- ⏳ Migrate FUNCTION_DECL, ACTUAL_DECL (need implicit return)
- ⏳ Migrate MODULE_DECL
- **Result**: Delete old CodeGenerator path, keep ASTConverter bridge

### Phase 2: Replace Parser Output (MAJOR EFFORT)

- Rewrite `Parser::parse()` to build typed AST directly
- Key challenge: Type annotations (TYPE nodes) → TypePtr
- Key challenge: Generic parameters → stored directly in decls
- OR: Minimal change - just change Parser output to build ASTConverter-friendly intermediate

**Options:**

- **Option A** (Clean): Parser → ParserAST → TypeChecker → TypedAST → CodeGen
  - Adds another layer but keeps concerns separated
  - ~2000 lines new code
- **Option B** (Radical): Parser → TypedAST directly
  - Parser becomes much more complex
  - ~1500 lines new code (refactor existing parse functions)

### Phase 3: Refactor TypeChecker

- Either: TypeChecker consumes ParserAST, produces enriched TypedAST
- Or: TypeChecker becomes two-pass over ParserAST
- Key: Stop mutating input, produce separate output with types

**Result**: TypeChecker is stateless, repeatable

### Phase 4: Remove ASTNode

- Delete ast.h
- Delete ASTConverter
- Parser/TypeChecker/CodeGen all use typed AST
- Compiler becomes: Lexer → Parser → TypeChecker → CodeGenerator

## Why ASTNode is Hard to Remove

1. **Dual Purpose**: Used as both:
   - Parse tree (shape/structure)
   - Semantic carrier (with inferredType, exprType)
2. **Mutation Pattern**: TypeChecker mutates ASTNode members:

   ```cpp
   node->inferredType = "I32";
   node->exprType = resolveType(...);
   ```

   Hard to migrate because type inference is inherently multi-pass

3. **Tree Structure**: Children vector is super flexible but makes:

   - Conversion to typed AST awkward
   - Pattern matching difficult
   - Type safety weak

4. **Generic Params**: Stored as vector of ASTNode, need to be extracted
   - Making type-level generics explicit is complex
   - Current system hides complexity in converters

## Estimated Total Effort

| Phase     | Task                       | Lines     | Difficulty | Time          |
| --------- | -------------------------- | --------- | ---------- | ------------- |
| 1         | Complete CodeGen migration | ~500      | Medium     | 4 hours       |
| 2a        | Parser refactor (Option A) | ~2000     | High       | 16 hours      |
| 2b        | Parser refactor (Option B) | ~1500     | High       | 12 hours      |
| 3         | TypeChecker refactor       | ~1500     | High       | 12 hours      |
| 4         | Cleanup/testing            | ~500      | Medium     | 4 hours       |
| **Total** |                            | **~6000** | **High**   | **~40 hours** |

## Recommendation

**Not worth doing unless**:

1. Parser/TypeChecker become maintenance burden
2. We need fundamentally different semantics
3. Adding new language features requires major changes

**Better alternatives**:

1. Keep ASTNode as parser output
2. Make TypeChecker immutable (pass input → produce output)
3. Use ASTConverter as permanent bridge
4. This is actually quite clean! Most compiler codebases do this

**Current state is good**:

- Parser is not touched frequently
- TypeChecker is stable and works well
- Gradual migration to typed codegen is working
- No technical debt accumulating

## Lowest-effort next steps

If you DO want to proceed:

1. **Complete CodeGen migration** (current work)
   - Finalize FUNCTION_DECL, ACTUAL_DECL, MODULE_DECL
   - This is the highest-ROI work
2. **Make TypeChecker immutable**
   - Don't mutate input ASTNode
   - Return enriched structure with types
   - This is useful even if ASTNode remains
3. **Create ParserIntermediateAST**
   - Lightweight, directly from Parser
   - Convert to TypedAST once
   - Avoids Parser rewrite
