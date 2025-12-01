#include "test.h"
#include "compiler.h"

using namespace tuff_test;

// =============================================================================
// Feature 1: Variables
// =============================================================================

TEST(variables_simple)
{
	assertEquals(
			"const x = 10;\n"
			"const y = 20;\n"
			"process.exit(x);\n",
			compile("let x = 10; let y = 20; x", "js"));
}

TEST(variables_mutable)
{
	assertEquals(
			"let x = 5;\n"
			"x = 100;\n"
			"process.exit(x);\n",
			compile("let mut x = 5; x = 100; x", "js"));
}

TEST(variables_immutable_reassign_error)
{
	assertCompileError("let x = 5; x = 100; x", "Cannot assign to immutable variable");
}

TEST(variables_shadowing_error)
{
	assertCompileError("let x = 5; let x = 10; x", "already declared");
}

// =============================================================================
// Feature 2: Operators
// =============================================================================

TEST(operators_arithmetic)
{
	assertEquals(
			"const a = 10;\n"
			"const b = 3;\n"
			"const add = (a + b);\n"
			"process.exit(add);\n",
			compile("let a = 10; let b = 3; let add = a + b; add", "js"));
}

TEST(operators_comparison)
{
	assertEquals(
			"const a = 10;\n"
			"const b = 5;\n"
			"const result = (a > b);\n"
			"process.exit((result ? 1 : 0));\n",
			compile("let a = 10; let b = 5; let result = a > b; result", "js"));
}

TEST(operators_logical)
{
	assertEquals(
			"const t = true;\n"
			"const f = false;\n"
			"const result = (t || f);\n"
			"process.exit((result ? 1 : 0));\n",
			compile("let t = true; let f = false; let result = t || f; result", "js"));
}

// =============================================================================
// Feature 3: Control Flow
// =============================================================================

TEST(control_if_expression)
{
	assertEquals(
			"const x = 10;\n"
			"const result = ((x > 5) ? 100 : 200);\n"
			"process.exit(result);\n",
			compile("let x: I32 = 10; let result: I32 = if (x > 5) 100 else 200; result", "js"));
}

TEST(control_while_loop)
{
	assertEquals(
			"let i = 0;\n"
			"while ((i < 5)) {\n"
			"  i = (i + 1);\n"
			"};\n"
			"process.exit(i);\n",
			compile("let mut i = 0; while (i < 5) { i = i + 1; } i", "js"));
}

TEST(control_loop_break)
{
	assertEquals(
			"let i = 0;\n"
			"while (true) {\n"
			"  i = (i + 1);\n"
			"  if ((i > 3)) {\n"
			"  break;\n"
			"};\n"
			"};\n"
			"process.exit(i);\n",
			compile("let mut i: I32 = 0; loop { i = i + 1; if (i > 3) { break; } } i", "js"));
}

// =============================================================================
// Feature 4: Structs
// =============================================================================

TEST(structs_basic)
{
	assertEquals(
			"const p = { x: 10, y: 20 };\n"
			"const x_val = p.x;\n"
			"process.exit(x_val);\n",
			compile("struct Point { x: I32, y: I32 } let p = Point { 10, 20 }; let x_val = p.x; x_val", "js"));
}

TEST(structs_mutation)
{
	assertEquals(
			"let p = { x: 5, y: 10 };\n"
			"p.x = 100;\n"
			"process.exit(p.x);\n",
			compile("struct Point { x: I32, y: I32 } let mut p = Point { 5, 10 }; p.x = 100; p.x", "js"));
}

// =============================================================================
// Feature 5: Functions
// =============================================================================

TEST(functions_expression_body)
{
	assertEquals(
			"function add(a, b) {\n"
			"  return (a + b);\n"
			"};\n"
			"process.exit(add(2, 3));\n",
			compile("fn add(a: I32, b: I32): I32 => a + b; add(2, 3)", "js"));
}

TEST(functions_block_body)
{
	assertEquals(
			"function add(x, y) {\n"
			"  return (x + y);\n"
			"};\n"
			"const result = add(5, 10);\n"
			"process.exit(result);\n",
			compile("fn add(x: I32, y: I32): I32 => { return x + y; } let result = add(5, 10); result", "js"));
}

TEST(functions_recursion)
{
	assertEquals(
			"function factorial(n) {\n"
			"  if ((n == 0)) {\n"
			"  return 1;\n"
			"};\n"
			"  return (n * factorial((n - 1)));\n"
			"};\n"
			"process.exit(factorial(5));\n",
			compile(
					"fn factorial(n: I32): I32 => { if (n == 0) { return 1; } return n * factorial(n - 1); } "
					"factorial(5)",
					"js"));
}

// =============================================================================
// Feature 6: Enums
// =============================================================================

TEST(enums_basic)
{
	assertEquals(
			"const Color = { Red: 0, Green: 1, Blue: 2 };\n"
			"const c = Color.Red;\n"
			"const g = Color.Green;\n"
			"process.exit(g);\n",
			compile(
					"enum Color { Red, Green, Blue } "
					"let c = Color.Red; let g = Color.Green; g",
					"js"));
}

TEST(enums_comparison)
{
	assertEquals(
			"const Status = { Success: 0, Failure: 1 };\n"
			"const s = Status.Success;\n"
			"const result = ((s == Status.Success) ? 100 : 200);\n"
			"process.exit(result);\n",
			compile(
					"enum Status { Success, Failure } "
					"let s = Status.Success; let result = if (s == Status.Success) 100 else 200; result",
					"js"));
}

// =============================================================================
// Feature 7: Generics
// =============================================================================

TEST(generics_function)
{
	assertEquals(
			"function identity(x) {\n"
			"  return x;\n"
			"};\n"
			"const a = identity(10);\n"
			"process.exit(a);\n",
			compile("fn identity<T>(x: T): T => x; let a: I32 = identity<I32>(10); a", "js"));
}

// =============================================================================
// Feature 8: Expect/Actual
// =============================================================================

TEST(expect_actual_missing_error)
{
	assertCompileError("expect fn missing(): I32; missing()", "not declared");
}

TEST(expect_actual_mismatch_error)
{
	assertCompileError(
			"expect fn mismatch(): I32; actual fn mismatch(): Bool => true; mismatch()",
			"return type mismatch");
}

// =============================================================================
// Feature 9: Modules
// =============================================================================

TEST(modules_basic)
{
	assertEquals(
			"const math = { add: function add(x, y) {\n"
			"  return (x + y);\n"
			"} };;\n"
			"const result = math.add(5, 3);\n"
			"process.exit(result);\n",
			compile(
					"module math { fn add(x: I32, y: I32): I32 => x + y; } "
					"let result = math::add(5, 3); result",
					"js"));
}

// =============================================================================
// Feature 10: Pointers and Arrays
// =============================================================================

TEST(pointers_basic)
{
	assertEquals(
			"const x = 42;\n"
			"const p = x;\n"
			"const y = p;\n"
			"process.exit(y);\n",
			compile("let x: I32 = 42; let p: *I32 = &x; let y: I32 = *p; y", "js"));
}

TEST(arrays_basic)
{
	assertEquals(
			"const arr = [10, 20, 30];\n"
			"const first = arr[0];\n"
			"const second = arr[1];\n"
			"process.exit((first + second));\n",
			compile(
					"let arr: [I32; 3; 3] = [10, 20, 30]; "
					"let first: I32 = arr[0]; let second: I32 = arr[1]; first + second",
					"js"));
}

TEST(arrays_mutable)
{
	assertEquals(
			"let arr = [10, 20, 30];\n"
			"arr[0] = 100;\n"
			"process.exit(arr[0]);\n",
			compile(
					"let mut arr: [I32; 3; 3] = [10, 20, 30]; arr[0] = 100; arr[0]", "js"));
}

// =============================================================================
// Feature 11: Ownership
// =============================================================================

TEST(ownership_move)
{
	assertEquals(
			"const d = { value: 42 };\n"
			"const e = d;\n"
			"process.exit(e.value);\n",
			compile("struct Data { value: I32 } let d = Data { 42 }; let e = d; e.value", "js"));
}

TEST(ownership_copy)
{
	assertEquals(
			"const x = 42;\n"
			"const y = x;\n"
			"process.exit((x + y));\n",
			compile("let x: I32 = 42; let y = x; x + y", "js"));
}

// =============================================================================
// Feature 13: Unions
// =============================================================================

TEST(unions_is_check)
{
	assertEquals(
			"const x = {__tag: \"I32\", __value: 42};\n"
			"process.exit(((x.__tag === \"Bool\") ? 1 : 2));\n",
			compile("let x: I32 | Bool = 42; (if (x is Bool) 1 else 2)", "js"));
}

// =============================================================================
// C++ Target
// =============================================================================

TEST(cpp_variables)
{
	assertEquals(
			"#include <iostream>\n"
			"#include <cstdint>\n"
			"#include <cstddef>\n"
			"#include <string>\n"
			"\n"
			"int main() {\n"
			"    const int32_t x = 10;\n"
			"    return x;\n"
			"}\n",
			compile("let x = 10; x", "cpp"));
}

TEST(cpp_mutable)
{
	assertEquals(
			"#include <iostream>\n"
			"#include <cstdint>\n"
			"#include <cstddef>\n"
			"#include <string>\n"
			"\n"
			"int main() {\n"
			"    int32_t x = 10;\n"
			"    x = 20;\n"
			"    return x;\n"
			"}\n",
			compile("let mut x = 10; x = 20; x", "cpp"));
}

TEST(cpp_function)
{
	assertEquals(
			"#include <iostream>\n"
			"#include <cstdint>\n"
			"#include <cstddef>\n"
			"#include <string>\n"
			"\n"
			"int32_t add(int32_t a, int32_t b);\n"
			"int main() {\n"
			"    return add(2, 3);\n"
			"}\n"
			"\n"
			"int32_t add(int32_t a, int32_t b) {\n"
			"  return a + b;\n"
			"}\n",
			compile("fn add(a: I32, b: I32): I32 => a + b; add(2, 3)", "cpp"));
}

// =============================================================================
// Main
// =============================================================================

int main()
{
	return RUN_TESTS();
}
