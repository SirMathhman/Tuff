# Phase 4 Plan: Full Type Checking and Analyzer

**Current Status**: Analyzer partially implemented with no-shadowing, basic mutability checks, and simple Bool condition validation.

**Goal**: Complete Phase 4 to achieve robust type checking, name resolution, and comprehensive diagnostics that enable safe language semantics.

---

## 1. Current Implementation Status

### ✅ Completed Features

1. **No-Shadowing Enforcement**
   - Variables cannot be redeclared in enclosing/nested scopes
   - `scopes_contains()` checks all scope levels
   - Tests: `selfhost_analyzer_shadowing.test.ts`

2. **Mutability Validation**
   - Immutable `let` bindings reject assignments
   - `let mut` bindings allow reassignment
   - Field/index assignment through immutable bindings rejected
   - Tests: `selfhost_analyzer_mutability.test.ts`

3. **Basic Bool Condition Checking**
   - `if`, `while` conditions must be Bool
   - Simple type inference for obvious non-Bool cases (Int, String)
   - Panic on type mismatch
   - Tests: `selfhost_analyzer_types.test.ts`

4. **Name Resolution Basics**
   - `lookup_binding()` finds names in scopes
   - `require_name()` allows built-ins (true/false/continue/break)
   - Scope depth tracking via `scopes_enter()`

5. **Type Inference Stubs**
   - `infer_expr_type()` returns type tags: `"Bool"`, `"Int"`, `"String"`, `"Unknown"`
   - Handles literals, simple unary/binary ops, and identifiers
   - Function calls and complex expressions return `"Unknown"`

---

## 2. Identified Gaps and TODOs

### 2.1 Type System Limitations

#### Gap: Incomplete Type Inference
- **Issue**: Many expression types return `"Unknown"` (function calls, field access, struct literals, etc.)
- **Impact**: Downstream type checking is too permissive; users can pass wrong types to functions
- **Solution**:
  - Extend `infer_expr_type()` to handle:
    - Struct field types (requires struct definition lookup)
    - Function return types (requires function signature tracking)
    - Generic type instantiation
    - Array/tuple element types
    - Union variant types (via pattern narrowing)

#### Gap: No Type Annotations Storage
- **Issue**: Parser reads type annotations but analyzer doesn't store/validate them
- **Impact**: Explicit types on let bindings are ignored; mismatches go undetected
- **Solution**:
  - Store annotated type in `SLet` bindings
  - Compare with inferred type; error on mismatch
  - Add tests for explicit type declaration conflicts

#### Gap: No Struct Definition Registry
- **Issue**: Analyzer doesn't track struct/union definitions; can't validate field access or construction
- **Impact**: Invalid struct literals or field access silently compile
- **Solution**:
  - Build a `structs: Map<String, StructDef>` during analyzer setup
  - Validate field names and types in struct literals (DStructLit)
  - Validate field access (EField) against struct definitions
  - Add tests for missing/wrong fields

#### Gap: No Function Signature Tracking
- **Issue**: Function declarations aren't cataloged; can't validate calls or return types
- **Impact**: Function mismatches, wrong argument counts, and return type mismatches go undetected
- **Solution**:
  - Build a `functions: Map<String, FunctionSig>` registry
  - Include parameter types, return type, generics
  - Validate call arguments against parameters (type + arity)
  - Add tests for arity/type mismatches

#### Gap: No Generic Type Instantiation
- **Issue**: Generic functions (e.g., `fn id<T>(x: T) : T`) aren't type-checked; instantiations aren't validated
- **Impact**: Generic code is not type-safe; mismatched type parameters compile
- **Solution**:
  - Track generic parameters on functions and structs
  - Validate type parameters at instantiation sites
  - Implement simple type substitution for checking
  - Add tests for generic function calls and struct construction

### 2.2 Pattern Matching and Union Types

#### Gap: No Union Type Narrowing
- **Issue**: `is` checks and `match` arms don't validate exhaustiveness or narrow types
- **Impact**: Invalid patterns and unhandled cases compile
- **Solution**:
  - Track union type definitions (type aliases like `Option<T>`, `Result<T, E>`)
  - In `match` expressions:
    - Check all variants are covered (or `_` wildcard present)
    - Narrow types for bound variables inside arms
    - Add tests for exhaustiveness and missing arms

#### Gap: No `is` Type Narrowing
- **Issue**: `if (x is SomeVariant)` parses but doesn't narrow scope type
- **Impact**: Variables inside `is` blocks have wrong type information
- **Solution**:
  - Implement scope-local type narrowing for `is` guards
  - Update binding types in nested scopes based on guard
  - Add tests for narrowed type usage

### 2.3 Array and Initialization Tracking

#### Gap: No Array Initialization Validation
- **Issue**: Arrays like `[U8; 3; 3]` (initialized, length) aren't validated
- **Impact**: Out-of-bounds initialization or mismatched lengths go undetected
- **Solution**:
  - Parse and track `[ElementType; InitCount; MaxLength]` format
  - Validate initialization count ≤ max length
  - Add tests for array construction

#### Gap: No Array Bounds Checking
- **Issue**: Array indexing isn't validated; any index is allowed
- **Impact**: Out-of-bounds accesses compile without warning
- **Solution**:
  - Store array bounds in type information (or infer from context)
  - Warn on statically-provable out-of-bounds accesses
  - Add tests for bounds checking (deferred if complex)

### 2.4 Advanced Type Checking

#### Gap: No Context-Driven Type Inference
- **Issue**: Unsuffixed literals default to `I32`/`F32` but aren't adjusted by context
- **Impact**: Type mismatches can occur even with explicit context (e.g., `let x: U8 = 300` should error)
- **Solution**:
  - Pass expected type to `infer_expr_type()` / add a `check_expr_against_type()` function
  - Adjust literal types based on context
  - Add tests for context-driven narrowing

#### Gap: No Operator Type Checking
- **Issue**: Binary operators aren't type-checked; e.g., `"hello" + 5` is allowed
- **Impact**: Type-unsafe operations compile
- **Solution**:
  - Add operator type rules (e.g., `+`: (Int, Int) → Int or (String, String) → String)
  - Validate operand types in `EBinary`
  - Add tests for operator type mismatches

#### Gap: No Type Coercion or Implicit Conversions
- **Issue**: Type system doesn't define coercion rules (e.g., can U8 be used where I32 expected?)
- **Impact**: Unclear behavior for mixed-type expressions
- **Solution**:
  - Define coercion rules in LANGUAGE.md (or keep strict, no coercion)
  - Validate coercibility in assignment/function calls
  - Add tests for coercion cases

### 2.5 Scope and Declaration Handling

#### Gap: Module-Level Declarations Not Tracked
- **Issue**: Top-level `fn`, `struct`, `type` aren't registered in a global scope
- **Impact**: Cross-module references can't be validated
- **Solution**:
  - Build module-level symbol table during `analyze_decls()`
  - Validate forward references and imports
  - Add tests for module-level scoping

#### Gap: Limited Import Validation
- **Issue**: `from X use { ... }` isn't validated; missing imports don't error
- **Impact**: Invalid imports compile
- **Solution**:
  - Validate imported names exist in target module
  - Track re-exports and transitive imports
  - Add tests for import errors

### 2.6 Diagnostic Quality

#### Gap: Error Messages Could Be More Helpful
- **Issue**: Some panics are minimal (e.g., "unknown name: foo")
- **Impact**: Hard to debug
- **Solution**:
  - Add context to errors (e.g., "unknown name 'foo' at line 5; did you mean 'bar'?")
  - Suggest similar names (levenshtein distance)
  - Provide fix hints (e.g., "try declaring: `let mut x = ...`")

---

## 3. Proposed Implementation Roadmap

### **Phase 4a: Type Annotation and Basic Struct Support** (Priority: HIGH)

**Goal**: Enable type annotations and struct field validation.

**Tasks**:

1. **Parse and Store Type Annotations**
   - Extract type annotation from `SLet` (already in AST)
   - Validate annotated type matches inferred type
   - Error on type mismatch
   - **Test**: `let x: I32 = "bad"; // Error: expected I32, got String`

2. **Build Struct Definition Registry**
   - Scan all declarations for `struct` / `type` definitions
   - Build `structs: Map<String, StructDef>` with field info
   - **Test**: Validate struct literals against known fields

3. **Struct Literal and Field Access Validation**
   - In `DStructLit`, validate:
     - All fields provided (or allow defaults)
     - Field types match values
   - In `EField`, validate:
     - Field exists in struct definition
     - Type of field is correct
   - **Tests**:
     - `struct Point { x: I32, y: I32 }`
     - `let p = Point { x: 10, y: 20 }; // OK`
     - `let p = Point { 10, "bad" }; // Error: y type mismatch`
     - `let z = p.z; // Error: unknown field`

**Estimated Effort**: ~1-2 weeks  
**Tests to Add**: 5-10 test cases in `selfhost_analyzer_types.test.ts`

---

### **Phase 4b: Function Signatures and Call Validation** (Priority: HIGH)

**Goal**: Track function signatures and validate calls.

**Tasks**:

1. **Build Function Signature Registry**
   - Scan declarations for `fn` definitions
   - Store `(name, params: [Type], returnType, isGeneric, generics: [String])`
   - **Test**: Registry is built correctly before analysis

2. **Function Call Validation**
   - Validate call arity (argument count)
   - Validate argument types against parameter types
   - Validate return type is used correctly
   - **Tests**:
     - `fn add(x: I32, y: I32) : I32 => x + y;`
     - `let z = add(1, 2); // OK`
     - `let z = add(1); // Error: missing argument`
     - `let z = add(1, "bad"); // Error: type mismatch`

3. **Return Type Tracking**
   - Store function return types in registry
   - Validate return/yield statements match declared type
   - **Test**: `fn bad() : Bool => 42; // Error: expected Bool, got Int`

**Estimated Effort**: ~2 weeks  
**Tests to Add**: 8-12 test cases

---

### **Phase 4c: Generic Types** (Priority: MEDIUM)

**Goal**: Support generic function and struct type checking.

**Tasks**:

1. **Generic Function Validation**
   - Track generic parameters on functions
   - At call site, validate type parameters are provided (if needed)
   - Implement simple type substitution for parameter/return types
   - **Test**:
     - `fn id<T>(x: T) : T => x;`
     - `let f: (I32) => I32 = id<I32>;` // OK
     - `let g = id;` // Error: type parameters required

2. **Generic Struct Instantiation**
   - Track generic parameters on struct definitions
   - Validate type parameters at construction site
   - **Test**:
     - `struct Pair<T, U> { first: T, second: U }`
     - `let p: Pair<I32, String> = Pair { 1, "hi" };` // OK

**Estimated Effort**: ~2-3 weeks  
**Tests to Add**: 10-15 test cases

---

### **Phase 4d: Union Types and Pattern Matching** (Priority: MEDIUM)

**Goal**: Add union type validation and exhaustiveness checking.

**Tasks**:

1. **Union Type Registry**
   - Track `type Result<T, E> = Ok<T> | Err<E>;` definitions
   - Store variant info (name, inner type)

2. **Match Exhaustiveness**
   - In `match` expressions, check all variants are covered
   - Allow `_` wildcard catch-all
   - Error if variants missing and no catch-all
   - **Test**:
     - `match (result) { Ok(x) => x, Err(_) => -1 }` // OK
     - `match (result) { Ok(x) => x }` // Error: missing Err case

3. **Type Narrowing in Match Arms**
   - Narrow type of bound variables inside arms
   - E.g., inside `Ok(x) =>`, type of `x` is the inner type
   - **Test**: Accessing wrong fields should error

**Estimated Effort**: ~2-3 weeks  
**Tests to Add**: 10-15 test cases

---

### **Phase 4e: Operator Type Rules and Type Coercion** (Priority: MEDIUM)

**Goal**: Validate operator operand types and define coercion rules.

**Tasks**:

1. **Define Operator Type Rules** (update LANGUAGE.md)
   - Arithmetic: `(Int, Int) → Int`, `(String, String) → String` (only for `+`)
   - Comparison: `(T, T) → Bool` for all comparable types
   - Logical: `(Bool, Bool) → Bool`
   - **Test**: Each operator with mismatched types

2. **Implement Operator Validation**
   - In `EBinary`, check operand types against rules
   - Error on type mismatch
   - **Test**:
     - `1 + 2` // OK: Int
     - `"a" + "b"` // OK: String
     - `1 + "bad"` // Error: cannot add Int and String

3. **Context-Driven Type Inference** (optional, deferred)
   - Pass expected type to `infer_expr_type()`
   - Adjust literal types based on context
   - **Test**: `let x: U8 = 300;` // Error: out of range

**Estimated Effort**: ~1-2 weeks  
**Tests to Add**: 8-12 test cases

---

### **Phase 4f: Advanced Features** (Priority: LOW, defer to Phase 5+)

These can be deferred or implemented after core type checking is solid:

- **Array bounds checking** (complex, low ROI)
- **Lifetime tracking** (planned for post-bootstrap)
- **Type inference for nested expressions** (complex, requires bidirectional inference)
- **Custom type display and error recovery**

---

## 4. Implementation Strategy

### Analyzer Refactoring

**Current Structure**:
- Single `analyzer.tuff` module (~450 lines)
- Functions: `infer_expr_type()`, `check_cond_is_bool()`, `analyze_expr/stmt/decl()`
- Global scope: `scopes` Vec of Vecs

**Proposed Changes**:

1. **Extend `Binding` struct** to include more type info (e.g., field types for structs)
2. **Add Registry Structs**:
   ```tuff
   struct StructDef {
       name: String,
       fields: Vec<(String, TypeRef)>,  // field name, type
       generics: Vec<String>              // generic parameters
   }

   struct FunctionSig {
       name: String,
       params: Vec<TypeRef>,              // parameter types
       returnType: TypeRef,
       generics: Vec<String>,             // generic parameters
       isMut: Bool
   }
   ```

3. **Add Registry Building Phase**
   - Scan all declarations for struct/type/fn definitions
   - Build registries before analyzing bodies
   - Store as global mutable state (via `reset_struct_defs()` pattern)

4. **Extend `infer_expr_type()`**
   - Handle function calls (look up in registry)
   - Handle field access (look up struct definition)
   - Handle generic instantiation

### Testing Strategy

1. **Unit Tests** (in `selfhost_analyzer_*.test.ts`)
   - Add one test file per Phase 4a-e
   - Each file: 5-15 test cases covering happy path + error cases
   - Use the same staging pattern (stage1 compiler → stage2 compiler → test bad code)

2. **Tuff Integration Tests** (in `src/test/tuff/`)
   - Add type checking validation tests
   - E.g., `selfhost_analyzer_types.test.tuff` for end-to-end validation

3. **Regression Tests**
   - Run full `npm test` after each phase
   - Ensure existing tests still pass

### Tooling Support

- **Error Messages**: Use `panic_at()` with helpful context
- **Suggestions**: (optional) Implement name similarity for suggestions

---

## 5. Success Criteria

### By End of Phase 4a
- [ ] Type annotations in `let` bindings are validated
- [ ] Struct definitions are tracked and validated
- [ ] Struct literals and field access are type-checked
- [ ] 10+ new test cases pass

### By End of Phase 4b
- [ ] Function signatures are tracked
- [ ] Function calls are validated for arity and types
- [ ] Return types are tracked and checked
- [ ] 15+ new test cases pass

### By End of Phase 4c
- [ ] Generic functions are supported
- [ ] Generic structs are supported
- [ ] Type parameter validation at instantiation sites
- [ ] 15+ new test cases pass

### By End of Phase 4d
- [ ] Union types are tracked
- [ ] Match exhaustiveness is validated
- [ ] Type narrowing works in match arms
- [ ] 15+ new test cases pass

### By End of Phase 4e
- [ ] Operator type rules are defined and enforced
- [ ] Type coercion (if any) is clearly specified
- [ ] 10+ new test cases pass

### Overall Phase 4 Success
- [ ] Compiler rejects 100% of intentionally invalid type scenarios in tests
- [ ] No regressions in existing tests
- [ ] `npm test` passes cleanly
- [ ] Code is well-commented and maintainable
- [ ] LANGUAGE.md is updated with type rules

---

## 6. Timeline Estimate

| Phase | Effort | Timeline |
|-------|--------|----------|
| 4a (Type Annotations + Structs) | 1-2 weeks | Weeks 1-2 |
| 4b (Functions) | 2 weeks | Weeks 3-4 |
| 4c (Generics) | 2-3 weeks | Weeks 5-7 |
| 4d (Union/Match) | 2-3 weeks | Weeks 8-10 |
| 4e (Operators) | 1-2 weeks | Weeks 11-12 |
| **Total** | **8-12 weeks** | **~3 months** |

---

## 7. Rollout and Integration

1. **Phase 4a**: Land first, unblock struct usage
2. **Phase 4b**: Essential for function type safety
3. **Phase 4c**: Enables generic abstractions (may unblock stdlib improvements)
4. **Phase 4d**: Enables safer error handling patterns
5. **Phase 4e**: Completes core type system

Each phase:
- Merges independently (incremental commits)
- Updates LANGUAGE.md with new rules
- Adds comprehensive tests
- Does not break existing functionality

---

## 8. Notes and Open Questions

1. **Type Inference Complexity**: How much bidirectional inference is needed? (deferred to later)
2. **Error Recovery**: Should analyzer continue after first error? (current: panic on first error)
3. **Generic Constraints**: Do we need trait-like constraints? (likely not in bootstrap)
4. **Variance**: Do we need covariance/contravariance rules? (likely not in bootstrap)
5. **Type Display**: How should types be displayed in error messages?

---

## Appendix: Links to Related Code

- [analyzer.tuff](src/main/tuff/compiler/analyzer.tuff) — Current implementation
- [ast.tuff](src/main/tuff/compiler/ast.tuff) — AST definitions
- [LANGUAGE.md](LANGUAGE.md) — Language specification
- [selfhost_analyzer_*.test.ts](src/test/ts/) — Existing test suite
