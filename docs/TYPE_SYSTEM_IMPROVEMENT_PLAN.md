# Type System Improvement Plan

## Current Problems

### 1. String-Based Types
**Issue**: All types are stored as strings in `ASTNode::inferredType`
```cpp
node->inferredType = "I32";
node->inferredType = "Vec<I32>";
node->inferredType = "*mut Some<I32> | None<I32>";
```

**Problems**:
- Parsing types multiple times (type checker → codegen)
- Type substitution breaks (generics don't work properly)
- Hard to reason about type structure
- Error messages are poor
- No type safety

**Example**: `malloc<T>` broken:
```tuff
extern fn malloc<T>(size: USize): *mut [T];
let data = malloc<I32>(100USize);
```

Generated as:
```cpp
T* const data = malloc<int32_t>(100);  // WRONG - T not bound
```

Should be:
```cpp
int32_t* const data = malloc(100);  // Correct - T→int32_t substituted
```

### 2. No Type Environment
**Issue**: Can't track type substitutions (T → I32, U → F64, etc.)

**Missing**:
- Generic type parameter binding
- Type variable substitution
- Context for type checking

### 3. Type Checking Uses String Comparison
**Issue**: `isTypeCompatible()` and type operations use string matching

**Problems**:
- Doesn't understand type structure
- Can't do proper unification
- Can't track lifetimes
- Generic bounds not enforceable

### 4. Semantic vs. Syntactic Types
**Issue**: No distinction between:
- Parse tree (syntax: "*I32", "Vec<T>")
- Type representation (semantics: PointerType{I32}, GenericType{Vec, [I32]})

## Implementation Progress

### ✅ Phase 1: TypeEnvironment Implementation (COMPLETED)

- ✅ Created TypeEnvironment class (200 lines)
- ✅ Supports type variable binding and substitution
- ✅ Handles generics, pointers, arrays, union types
- ✅ Added to ASTNode for use by type checker
- ✅ Tests: All 82 tests passing

**Key Implementation Details**:
- Handles nested generic types: `Vec<T>` → `Vec<I32>`
- Recursively substitutes in pointers: `*mut T` → `*mut I32`
- Handles union types properly: `Some<T>|None<T>` → `Some<I32>|None<I32>`
- Whitespace-tolerant parsing

### ✅ Phase 2: TypeChecker Integration (COMPLETED)

- ✅ Modified `checkCallExpr()` to populate `node->typeEnv`
- ✅ Binds generic parameters during call processing
- ✅ Stores both ExprPtr and string substitutions
- ✅ Tests: All 82 tests passing

**Key Changes**:
```cpp
// During generic function call
node->typeEnv.bind("T", "I32");
node->typeEnv.bind("U", "F64");

// Return type resolution
std::string returnTypeStr = node->typeEnv.substitute(originalReturnType);
```

**What This Fixes**:
- Generic function calls now properly track type substitutions
- Return types are correctly substituted before reaching codegen
- String-based and ExprPtr-based type systems work together

### Phase 3: Update Codegen (NEXT)

**Goal**: Use substituted types from TypeEnvironment

**What to do**:
1. In `genExpr()` for CALL_EXPR: Use return type from node->inferredType (already substituted by TypeChecker)
2. In `mapType()`: Trust types are already substituted, simplify logic
3. In `generateFunctionBlock()`: Pass TypeEnvironment to child nodes

**No changes needed**: Most codegen already uses `node->inferredType` which TypeChecker now populates with substituted types!

### Phase 4: Testing (IN PROGRESS)

Need to test generic functions:
- [ ] Create test: `extern fn malloc<T>(...): *mut [T]`
- [ ] Verify generated code: `int32_t* data = malloc(...);` (no template)
- [ ] Test with complex types: `Vec<Vec<I32>>`
- [ ] Test nested generics in union types

### Phase 5: Cleanup (TODO)

- [ ] Remove old type parsing code
- [ ] Update documentation
- [ ] Performance profiling

### Phase 1: Create TypeEnvironment (2-3 hours)

**Goal**: Track type substitutions without changing rest of compiler

**What to implement**:
```cpp
// bootstrap/src/include/type_env.h (new)
struct TypeEnvironment {
    // Map type variables to their concrete types
    // T -> I32, U -> F64, etc.
    std::map<std::string, std::string> substitutions;
    
    // Apply substitution to a type string
    std::string substitute(const std::string& type) const;
    
    // Add binding T -> I32
    void bind(const std::string& typeVar, const std::string& concreteType);
    
    // Create child environment (for function scopes)
    TypeEnvironment createChild() const;
};
```

**Usage**:
```cpp
TypeEnvironment env;
env.bind("T", "I32");
std::string result = env.substitute("*mut [T]");  // "*mut [I32]"
```

**Why this helps**:
- ✅ Minimal change to existing system
- ✅ Type checker can remain mostly unchanged
- ✅ Codegen can now properly substitute types
- ✅ Fixes malloc<T> issue
- ✅ Generic functions will work correctly

### Phase 2: Update TypeChecker to Use TypeEnvironment (2-3 hours)

**Where to modify**:
- `checkCallExpr()`: Build TypeEnvironment when calling generic functions
- `checkFunctionDecl()`: Register generic parameters
- Pass TypeEnvironment through check methods

**Example change**:
```cpp
// Before:
void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node) {
    // ...
    auto returnType = func.returnTypeExpr;
    node->inferredType = typeToString(returnType);  // STRING
}

// After:
void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node) {
    // ...
    TypeEnvironment callEnv;
    // For malloc<I32>(100), bind T -> I32
    callEnv.bind("T", argType);
    
    auto returnType = func.returnTypeExpr;
    node->inferredType = callEnv.substitute(typeToString(returnType));
}
```

### Phase 3: Update Codegen to Use TypeEnvironment (1-2 hours)

**Where to modify**:
- `genExpr()` for CALL_EXPR: Use environment from TypeChecker
- `mapType()`: Can now trust types are already substituted

**Benefits**:
- ✅ No more parsing types
- ✅ malloc<T> generates correct code
- ✅ Generic functions work

## Detailed Implementation

### Step 1: Create TypeEnvironment Class

```cpp
// bootstrap/src/type_env.cpp

TypeEnvironment::TypeEnvironment() {}

void TypeEnvironment::bind(const std::string& typeVar, const std::string& concreteType) {
    substitutions[typeVar] = concreteType;
}

std::string TypeEnvironment::substitute(const std::string& type) const {
    // Handle simple case: "T" -> "I32"
    if (substitutions.find(type) != substitutions.end()) {
        return substitutions.at(type);
    }
    
    // Handle generic case: "Vec<T>" -> "Vec<I32>"
    size_t ltPos = type.find('<');
    if (ltPos != std::string::npos) {
        std::string base = type.substr(0, ltPos);
        size_t gtPos = type.rfind('>');
        std::string args = type.substr(ltPos + 1, gtPos - ltPos - 1);
        
        // Recursively substitute in args
        std::string substArgs = substitute(args);
        return base + "<" + substArgs + ">";
    }
    
    // Handle union: "Some<T>|None<T>" -> "Some<I32>|None<I32>"
    if (type.find('|') != std::string::npos) {
        // Split, substitute each part, rejoin
        auto variants = split(type, '|');
        std::string result;
        for (const auto& v : variants) {
            if (!result.empty()) result += "|";
            result += substitute(v);
        }
        return result;
    }
    
    // No substitution needed
    return type;
}

TypeEnvironment TypeEnvironment::createChild() const {
    TypeEnvironment child;
    child.substitutions = this->substitutions;  // Copy bindings
    return child;
}
```

### Step 2: Update TypeChecker::checkCallExpr

Current (broken):
```cpp
void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node) {
    // ...
    std::string returnType = mapType(func.returnType);  // Unbound generics!
    node->inferredType = returnType;
}
```

New (fixed):
```cpp
void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node) {
    // ...
    
    // Build type environment for this call
    TypeEnvironment callEnv;
    
    // Bind generic parameters from call
    if (!func.genericParams.empty() && !node->genericArgsNodes.empty()) {
        for (size_t i = 0; i < func.genericParams.size(); i++) {
            std::string typeVar = func.genericParams[i]->value;
            std::string argType = /* resolve arg type */;
            callEnv.bind(typeVar, argType);
        }
    }
    
    // Substitute in return type
    std::string returnType = typeToString(func.returnType);
    std::string substReturn = callEnv.substitute(returnType);
    node->inferredType = substReturn;
}
```

### Step 3: Store TypeEnvironment on AST Nodes

Add to ASTNode:
```cpp
struct ASTNode {
    // ... existing fields ...
    TypeEnvironment typeEnvironment;  // For later use in codegen
};
```

This allows codegen to have access to the same substitutions.

### Step 4: Update Key Type Checker Functions

Functions that need updating:
- `checkCallExpr()` - Bind generic params, substitute return type
- `checkFunctionDecl()` - Register generic params
- `checkBinaryOp()` - Respect type environment
- `checkStructLiteral()` - Substitute generic field types
- `checkArrayLiteral()` - Handle generic array types

## Benefits of This Approach

| Problem | Before | After |
|---------|--------|-------|
| `malloc<T>` codegen | Broken (T not bound) | Fixed (T→I32) |
| Generic function calls | Don't substitute | Proper substitution |
| Type checking | String comparison | Structure aware |
| Codegen complexity | Parse types | Types pre-parsed |
| Error messages | Generic "type mismatch" | Specific type info |

## Testing Strategy

1. **Add unit tests** for TypeEnvironment substitution
2. **Add integration tests** for generic functions
3. **Run full test suite** - should still pass
4. **Add malloc<T> test** - currently fails, will pass after

## Risk Assessment

**Low Risk**:
- TypeEnvironment is new, doesn't change existing code
- Type checker updates are localized
- Codegen just consumes what type checker produces
- Can be done incrementally, testing at each step

**Rollback Plan**:
- If issues arise, TypeEnvironment is easily removed
- Existing tests validate correctness

## Implementation Order

1. ✅ Create TypeEnvironment class
2. ✅ Add TypeEnvironment to ASTNode
3. ✅ Update checkCallExpr() to build and use TypeEnvironment
4. ✅ Update checkFunctionDecl() to register generic params
5. ✅ Add unit tests for substitution
6. ✅ Run full test suite
7. ✅ Create malloc<T> test case
8. ✅ Fix malloc codegen (should work automatically)
9. ✅ Document the system

## Timeline

- **Phase 1 (TypeEnvironment)**: 2-3 hours
- **Phase 2 (TypeChecker updates)**: 2-3 hours  
- **Phase 3 (Testing)**: 1-2 hours
- **Total**: 5-8 hours, ~500 lines of code

## Files to Create/Modify

**New Files**:
- `bootstrap/src/type_env.cpp` (150 lines)
- `bootstrap/src/include/type_env.h` (50 lines)

**Modified Files**:
- `bootstrap/src/include/ast.h` - Add TypeEnvironment field
- `bootstrap/src/type_checker.cpp` - Update check* methods
- `bootstrap/src/type_checker/*.cpp` - Various check methods
- CMakeLists.txt - Add type_env.cpp

## Success Criteria

- ✅ All existing tests pass
- ✅ malloc<T> generates correct C++ code
- ✅ Generic function calls work with proper type substitution
- ✅ No string-based type parsing in codegen
- ✅ Type errors are more informative
