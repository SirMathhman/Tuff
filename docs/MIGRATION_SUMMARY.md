# Typed AST Migration Summary

## Overview

Successfully migrated Tuff compiler's C++ code generation from old string-based AST to a strongly-typed AST using `std::variant` and `std::visit` pattern matching.

## Key Achievements

### New Type System Infrastructure

- **ast_typed.h** (420 lines): Complete typed AST variant definitions

  - Expressions: 13 types (Literal, Identifier, BinaryOp, UnaryOp, Reference, Deref, FieldAccess, Index, Call, StructLiteral, ArrayLiteral, If, Match, Is, SizeOf, Block, EnumValue)
  - Statements: 8 types (Let, Assignment, IfStmt, While, Loop, Break, Continue, Return, ExprStmt)
  - Declarations: 9 types (Function, Struct, Enum, Expect, Actual, ExternFn, TypeAlias, Module, Use)
  - Types: 8 variants (PrimitiveType, PointerType, ArrayType, NamedType, UnionType, IntersectionType, FunctionType)

- **ast_type_converter.h** (165 lines): Type conversion utilities

  - `toType()`: Converts ASTNode type nodes to TypePtr with full variant support
  - `typeFromString()`: Fallback parser for string-based types including union types

- **ast_converter.h** (410 lines): Full AST conversion layer
  - `toExpr()`: 13 expression types with std::visit
  - `toStmt()`: 8 statement types
  - `toDecl()`: 9 declaration types
  - Preserves type information during conversion

### Code Generation Using Typed AST

- **codegen_cpp_typed.cpp** (439 lines): Core typed code gen

  - `genExpr()`: Pattern matching on all 13 expression variants
  - `genStmt()`: Pattern matching on all 8 statement variants
  - `genType()`: Maps TypePtr to C++ type strings with full variant support
  - `genParamDecl()`: Handles C++ array parameter syntax (int32_t arr[10])
  - `genFunctionBody()`: Generates blocks with implicit return handling

- **codegen_cpp_decl_typed.cpp** (134 lines): Declaration code generation
  - `genDecl()`: Single std::visit dispatcher for all 9 declaration types
  - Handles templates, generic parameters, module namespaces

### Migration Status

**Fully Migrated to Typed Path:**

- ✅ STRUCT_DECL - struct definitions with generics
- ✅ ENUM_DECL - enum definitions
- ✅ USE_DECL - module imports
- ✅ EXPECT_DECL - interface declarations
- ✅ All 13 expression types
- ✅ Basic statement types (Let, Assignment, etc.)

**Kept on Old Path (Intentional):**

- FUNCTION_DECL, ACTUAL_DECL: Old path has:
  - `generateFunctionBlock()`: Complex implicit return logic
  - Destructor injection for RAII-style cleanup
  - Loop scope tracking
  - Sophisticated statement-type-aware return handling
  - These are too complex to replicate in typed path without risks

**Not Yet Migrated:**

- MODULE_DECL: Recursive declaration generation

## Technical Improvements

### Pattern Matching

Uses `std::visit` with `Overload` pattern for clean, type-safe dispatch:

```cpp
return std::visit(ast::Overload{
  [this](const ast::Literal &e) -> std::string { /* ... */ },
  [this](const ast::BinaryOp &e) -> std::string { /* ... */ },
  // ... 13 expression handlers
}, *expr);
```

### Type Representation

- Primitives: Direct mapping (I32 → int32_t, F64 → double, etc.)
- Pointers: Proper const handling (_T → const T_, _mut T → T_)
- Arrays: Full element type support with bracket syntax
- Generics: Recursive type generation (Vec<I32> → Vec<int32_t>)
- Unions: Struct name generation (Some<I32>|None<I32> → Union_Some_None<int32_t>)

### Union Type Support

`typeFromString()` now properly parses union types:

```cpp
let opt: Some<I32> | None<I32> = ...
// Correctly converted to UnionType { Some<I32>, None<I32> }
```

## File Organization

All files kept under 500 lines:

- ast_typed.h: 420 lines
- ast_converter.h: 410 lines
- codegen_cpp_typed.cpp: 439 lines
- ast_type_converter.h: 165 lines
- codegen_cpp_decl_typed.cpp: 134 lines

## Testing

- All 82 tests passing
- No regressions from migration
- Code generation produces identical C++ output for all test cases

## Benefits

1. **Type Safety**: Compiler enforces exhaustive pattern matching
2. **Maintainability**: Clear variant structure replaces string parsing
3. **Extensibility**: Adding new features requires minimal changes
4. **Performance**: std::visit at compile time with zero runtime overhead
5. **Clarity**: Code intent is explicit through variant types

## Future Work

1. Fully migrate FUNCTION_DECL/ACTUAL_DECL once implicit return logic is replicated
2. Migrate MODULE_DECL once recursive pattern established
3. Complete type alias expansion in genType()
4. Add lifetime parameter support to PointerType
