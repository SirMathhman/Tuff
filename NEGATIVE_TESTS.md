# Negative Test Cases (Error Cases)

This document catalogs all `expect_invalid` test cases in the Tuff compiler. These tests verify that the compiler correctly rejects invalid source code.

## Literal Validation

| Test | Source | Error |
|------|--------|-------|
| `test_u8_literal_out_of_range` | `256U8` | U8 literal exceeds valid range (0–255) |
| `test_u8_literal_negative` | `-1U8` | U8 literal is negative |

## Type Mismatches

| Test | Source | Error |
|------|--------|-------|
| `test_typed_let_array_mismatch` | `let x : I32 = [100]; x` | Scalar type annotation with array literal |
| `test_typed_array_size_mismatch` | `let x : [I32; 1] = []; x[0]` | Array size annotation doesn't match literal |
| `test_typed_array_scalar_rhs` | `let x = read(); let y : [I32; 3] = x;` | Scalar value assigned to array-typed variable |

## Mutability Violations

| Test | Source | Error |
|------|--------|-------|
| `test_compound_assign_without_mut` | `let x = read(); x += read(); x` | Compound assignment on immutable variable |
| `test_reassign_without_mut` | `let x = read(); x = read(); x` | Reassignment to immutable variable |
| `test_array_element_assign_without_mut` | `let x = [read()]; x[0] = read(); x[0]` | Array element assignment on immutable array |

## Undefined Symbols

| Test | Source | Error |
|------|--------|-------|
| `test_undefined_function_call` | `undefinedFunction()` | Calling a function that doesn't exist |

## Struct Errors

| Test | Source | Error |
|------|--------|-------|
| `test_struct_duplicate_fields` | `struct Empty { field : I32, field : I32 }` | Duplicate field names in struct |
| `test_struct_duplicate_definition` | `struct Empty {} struct Empty {}` | Duplicate struct definition |
| `test_struct_unknown_field_type` | `struct Wrapper { field : UnknownType }` | Unknown type used as struct field |
| `test_struct_missing_field_type` | `struct Wrapper { field }` | Struct field missing type annotation |

## Function Errors

| Test | Source | Error |
|------|--------|-------|
| `test_fn_unknown_param_type` | `fn test(random : UnknownType) => {}` | Unknown type in function parameter |
| `test_fn_unknown_return_type` | `fn get() : UnknownType => {}` | Unknown type in function return type |

## Extern FFI Errors

| Test | Source | Error |
|------|--------|-------|
| `test_extern_let_no_fn_declaration` | `extern let { malloc } = extern stdlib; malloc()` | Extern variable used without `extern fn` declaration |
| `test_extern_fn_arg_type_mismatch` | `extern let { malloc } = extern stdlib; extern fn malloc(param : I32) : Void; malloc(true)` | Argument type mismatch for extern function |

## Drop Type Errors

| Test | Source | Error |
|------|--------|-------|
| `test_drop_type_undefined_drop_fn` | `type Temp = I32 then undefinedDropFn;` | Drop type references undefined drop function |

---

# Missing Negative Tests (Should Be Added)

The following tests cover semantic violations that the compiler **already detects** but lack corresponding `expect_invalid` tests.

## Generic Struct Errors

| Proposed Test | Source | Error |
|---------------|--------|-------|
| `test_undefined_generic_struct` | `let x : UndefinedGeneric<I32> = UndefinedGeneric<I32> { value : 100 }; x` | Undefined generic struct during monomorphization |
| `test_generic_struct_unknown_type_arg` | `struct Wrapper<T> { value : T } let x : Wrapper<UnknownType> = Wrapper<UnknownType> { value : 100 }; x` | Unknown type substituted for generic param |

## Generic Function Errors

| Proposed Test | Source | Error |
|---------------|--------|-------|
| `test_generic_fn_unknown_type_arg` | `fn pass<T>(x : T) => x; pass<UnknownType>(100)` | Unknown type substituted for generic param |

## Extern Function Argument Count

| Proposed Test | Source | Error |
|---------------|--------|-------|
| `test_extern_fn_too_many_args` | `extern let { atoi } = extern stdlib; extern fn atoi(str : &Str) : I32; atoi("hello", 1)` | Function expects 1 argument but got 2 |
| `test_extern_fn_too_few_args` | `extern let { atoi } = extern stdlib; extern fn atoi(str : &Str) : I32; atoi()` | Function expects 1 argument but got 0 |

## Syntax Errors

| Proposed Test | Source | Error |
|---------------|--------|-------|
| `test_for_loop_invalid_syntax` | `for (i 1..10) i; i` | Missing `in` keyword in for loop |

---

# Compiler Gaps (Not Currently Detected)

The following semantic violations are **not caught** by the compiler. They either silently produce invalid C code (rejected by clang) or generate incorrect output. These represent opportunities for compiler improvements.

## Function Call Validation

| Violation | Source | Current Behavior |
|-----------|--------|-----------------|
| Regular fn wrong arg count | `fn add(a : I32, b : I32) => a + b; add(1)` | No arg count check for non-extern functions |
| Regular fn wrong arg count (extra) | `fn add(a : I32, b : I32) => a + b; add(1, 2, 3)` | No arg count check for non-extern functions |

## Type Operations

| Violation | Source | Current Behavior |
|-----------|--------|-----------------|
| Cast to unknown type | `let x = 100; x as UnknownType` | Falls back to raw type name; clang rejects |
| `sizeOf` with unknown type | `sizeOf<UnknownType>()` | Falls back to raw type name; clang rejects |
| `is` on non-union variable | `let x = 100; x is I32` | Silently returns `0` at runtime |

## Pointer Operations

| Violation | Source | Current Behavior |
|-----------|--------|-----------------|
| Dereference non-pointer | `let x = 100; *x` | Generates `(*x)` without type check; clang rejects |

## Struct Operations

| Violation | Source | Current Behavior |
|-----------|--------|-----------------|
| Field access on non-struct | `let x = 100; x.field` | Passes through as-is; clang rejects |
| Destructure non-existent field | `struct Point { x : I32, y : I32 } let { x, z } = Point { x : 3, y : 4 }; x` | No validation of pattern fields against struct |
