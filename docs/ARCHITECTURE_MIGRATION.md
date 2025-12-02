# Tuff Compiler Architecture Migration Plan

## Current State: The Problem

The Tuff compiler currently has a **hybrid type system** that makes it difficult to maintain and extend:

### What's Wrong

1. **Dual type representations** - Types exist as both:

   - `std::string inferredType` (deprecated, but still used everywhere)
   - `ExprPtr exprType` (the "new unified system", but barely used)

2. **String-based type handling throughout**:

   ```cpp
   // Type checking does string replacement
   if (typeSubstitutions.count(returnType)) {
       returnType = typeSubstitutions[returnType];  // "T" -> "I32"
   }

   // Codegen re-parses strings
   std::string cppType = mapType(node->inferredType);  // "*mut [T]" -> ???
   ```

3. **Loss of semantic information**:

   - Can't distinguish `T` (unbound type var) from `I32` (concrete) in a string
   - Can't track whether a function is `extern` without context
   - Can't represent complex types like `(*a I32, *b I32) -> *a I32` properly

4. **Generic instantiation is fragile**:

   - String replacement of `T` with `I32` in `*mut [T]` works by accident
   - No validation that substitutions are legal
   - No way to track which types are instantiated

5. **Codegen is brittle**:
   - `mapType()` string parsing is error-prone
   - No way to know if a return type like `T*` came from `*mut [T]` with `T=I32`
   - Template generation vs non-template generation requires ad-hoc checks

### Example of the Problem

```tuff
extern fn malloc<T>(size: USize): *mut [T];
let data = malloc<I32>(100USize);
```

**Current (wrong) codegen:**

```cpp
T* const data = malloc<int32_t>(100);  // T is unbound! malloc isn't a template!
```

**Desired codegen:**

```cpp
int32_t* const data = malloc(100);  // No template args, proper type substitution
```

**Why it fails:**

1. Type checker substitutes return type: `*mut [T]` -> `*mut [I32]`
2. But it stores this as string `"*mut [I32]"`
3. Codegen reads the string and tries to parse it
4. Parsing `*mut [T]` incorrectly extracts `T` as the base type
5. Never actually substitutes with `I32`

## The Solution: Complete Type System Migration

### Phase 1: Build the New Foundation (2-3 days)

**Goal**: Have `ExprPtr` as the single source of truth for all types.

#### 1.1 Complete `expr.h`

Ensure `ExprPtr` can represent **all** Tuff types:

```cpp
// Already have:
- PrimitiveExpr (I32, Bool, etc.)
- UnaryExpr (for *, &, mut)
- ArrayExpr ([T; init; cap])
- CallExpr (Generic<Args>)

// Need to add:
- FunctionExpr ((ParamTypes) -> ReturnType)
- UnionExpr (A | B)
- IntersectionExpr (A & B)
- IdentifierExpr with proper generic tracking
```

#### 1.2 Create `TypeEnvironment` class

```cpp
class TypeEnvironment {
  private:
    std::map<std::string, ExprPtr> typeVariables;  // T -> I32, U -> String
    std::map<std::string, ExprPtr> substitutions;  // T -> ExprPtr

  public:
    // Substitute all type vars in an expression
    ExprPtr substitute(ExprPtr type);

    // Unify two types (check if they match)
    bool unify(ExprPtr expected, ExprPtr actual);

    // Apply substitution map
    void applySubstitutions(const std::map<std::string, ExprPtr>& subs);
};
```

#### 1.3 Implement proper `TypeChecker` based on `ExprPtr`

```cpp
class TypeChecker {
  private:
    std::map<std::string, FunctionInfo> functionTable;

  public:
    // Check expressions and return ExprPtr types
    ExprPtr check(ASTNode* node);

    // Instantiate generic function
    ExprPtr instantiateGeneric(
        const FunctionInfo& func,
        const std::vector<ExprPtr>& typeArgs,
        TypeEnvironment& env
    );
};

struct FunctionInfo {
    ExprPtr signature;           // (ParamTypes) -> ReturnType as ExprPtr
    std::vector<std::string> genericParams;
    bool isExtern = false;
    bool isGeneric = false;
};
```

### Phase 2: Rewrite Type Checker (2-3 days)

**Goal**: All type information flows as `ExprPtr`, not strings.

#### 2.1 Update `checkCallExpr`

```cpp
void TypeChecker::checkCallExpr(ASTNode* node) {
    // Get callee info
    const FunctionInfo& funcInfo = functionTable[calleeName];

    // Create type environment for this call
    TypeEnvironment env;

    // Get concrete type arguments
    std::vector<ExprPtr> typeArgs = parseTypeArgs(node);  // ExprPtr, not string!

    // Instantiate function signature
    ExprPtr instantiatedSig = instantiateGeneric(funcInfo, typeArgs, env);

    // Instantiated sig is now something like:
    // (USize) -> int32_t*  (fully concrete, no type vars)

    // Validate arguments and set return type
    node->exprType = getReturnType(instantiatedSig);  // Use ExprPtr!
    node->calleeIsExtern = funcInfo.isExtern;
}
```

#### 2.2 Update `checkFunctionDecl`

```cpp
void TypeChecker::checkFunctionDecl(ASTNode* node) {
    // Parse signature as ExprPtr
    ExprPtr returnType = parseType(node->returnTypeNode);  // ExprPtr
    std::vector<ExprPtr> paramTypes;
    for (auto param : node->params) {
        paramTypes.push_back(parseType(param));
    }

    // Build function signature
    ExprPtr signature = std::make_shared<FunctionExpr>(
        paramTypes,
        returnType,
        node->genericParams  // Track generics properly
    );

    FunctionInfo info{
        signature,
        node->genericParams,
        node->type == ASTNodeType::EXTERN_FN_DECL
    };

    functionTable[node->value] = info;
}
```

### Phase 3: Rewrite Codegen (2-3 days)

**Goal**: Generate code from `ExprPtr` types, not string parsing.

#### 3.1 Create `TypeCodegen` class

```cpp
class TypeCodegen {
  public:
    // Convert ExprPtr type to C++ code
    std::string toCPP(ExprPtr type);

    // Convert ExprPtr type to JavaScript
    std::string toJS(ExprPtr type);

    // Helper: is this type a generic parameter?
    bool isGenericParam(ExprPtr type);

    // Helper: extract base type from pointer
    ExprPtr getPointedType(ExprPtr pointerType);
};
```

#### 3.2 Update code generation

```cpp
// OLD WAY (broken):
case ASTNodeType::LET_STMT: {
    std::string cppType = mapType(node->inferredType);  // String!
    // ...
}

// NEW WAY:
case ASTNodeType::LET_STMT: {
    std::string cppType = typeCodegen.toCPP(node->exprType);  // ExprPtr!
    // Now cppType is guaranteed correct
}
```

#### 3.3 Fix CALL_EXPR codegen

```cpp
case ASTNodeType::CALL_EXPR: {
    std::string callee = generateNode(node->children[0]);

    // For extern functions, don't emit template args
    if (!node->calleeIsExtern && !node->children[0]->genericArgs.empty()) {
        callee += "<";
        for (auto& arg : node->children[0]->genericArgs) {
            // arg is now ExprPtr, convert properly
            callee += typeCodegen.toCPP(arg);
        }
        callee += ">";
    }

    // ... rest of call generation
}
```

### Phase 4: Deprecate String Types (1-2 days)

**Goal**: Remove all `std::string inferredType` references.

1. Keep `std::string inferredType` in ASTNode for backward compatibility during migration
2. Always populate `exprType` instead
3. Gradually remove uses of `inferredType`
4. Final cleanup: remove the field entirely

## Migration Path (Safest Approach)

### Step 1: Parallel Implementation

- Keep old string-based system working
- Build new `ExprPtr`-based system alongside it
- No breaking changes to existing tests

### Step 2: Gradual Migration

- Migrate one component at a time:
  1. Type parsing: string -> ExprPtr
  2. Type checking: validate with ExprPtr
  3. Type codegen: generate code from ExprPtr
  4. Remove string types

### Step 3: Testing at Each Step

- Run full test suite after each component
- Keep git history clean with small, logical commits
- Easy to revert if issues found

## Deliverables

### Phase 1 (Foundation)

- [ ] Complete `expr.h` with all type representations
- [ ] Implement `TypeEnvironment` class
- [ ] Create `ExprPtr` versions of all type structures

### Phase 2 (Type Checking)

- [ ] Rewrite `checkCallExpr` for ExprPtr
- [ ] Rewrite `checkFunctionDecl` for ExprPtr
- [ ] Update all `check*` methods to return ExprPtr
- [ ] Implement generic instantiation with TypeEnvironment
- [ ] All tests still pass

### Phase 3 (Codegen)

- [ ] Create `TypeCodegen` class
- [ ] Update CALL_EXPR generation
- [ ] Update LET_STMT generation
- [ ] Update all expression codegen
- [ ] Fix malloc<T> example: generates `int32_t* data = malloc(100);`
- [ ] All tests still pass

### Phase 4 (Cleanup)

- [ ] Remove all `inferredType` string references
- [ ] Clean up `mapType()` function (or remove if unused)
- [ ] Remove old string-based substitution code
- [ ] Final test pass

## Expected Benefits

After migration:

✅ **Correct generic instantiation** - malloc<I32> generates proper C++
✅ **Type safety** - Compiler enforces type rules at AST level
✅ **Extensibility** - Easy to add new type forms (function types, etc.)
✅ **Maintainability** - Single source of truth for types (ExprPtr)
✅ **Debuggability** - Can inspect actual type AST vs strings
✅ **Performance** - Less string parsing, more direct traversal

## Estimated Timeline

- **Phase 1**: 2-3 days (foundation)
- **Phase 2**: 2-3 days (type checking)
- **Phase 3**: 2-3 days (codegen)
- **Phase 4**: 1-2 days (cleanup)

**Total**: ~1 week of focused work

## Risk Mitigation

- Use feature branches: `feature/type-system-migration`
- Small, reviewable commits
- Comprehensive testing at each phase
- Keep old system working until new one is complete
- Easy rollback at any point

## Dependencies

This migration enables:

- Literal types (`5I32` vs `I32`)
- Type bounds on generics (`fn<T: USize>`)
- Function types as first-class values
- Proper type inference
- Better error messages
