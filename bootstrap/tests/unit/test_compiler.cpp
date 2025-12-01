#include "test.h"
#include "compiler.h"

using namespace tuff_test;

// =============================================================================
// Variables Tests
// =============================================================================

TEST(simple_variable) {
    std::string result = compile("let x = 10; x", "js");
    assertEquals("const x = 10;\nprocess.exit(x);\n", result);
}

TEST(mutable_variable) {
    std::string result = compile("let mut x = 10; x = 20; x", "js");
    assertEquals("let x = 10;\nx = 20;\nprocess.exit(x);\n", result);
}

TEST(immutable_reassign_error) {
    assertCompileError("let x = 10; x = 20; x", "Cannot assign to immutable variable");
}

TEST(shadowing_error) {
    assertCompileError("let x = 10; let x = 20; x", "already declared");
}

// =============================================================================
// Operators Tests
// =============================================================================

TEST(arithmetic_operators) {
    std::string result = compile("let x = 5 + 3; x", "js");
    assertEquals("const x = (5 + 3);\nprocess.exit(x);\n", result);
}

TEST(comparison_operators) {
    std::string result = compile("let x = 5 > 3; x", "js");
    assertContains("(5 > 3)", result);
}

// =============================================================================
// Functions Tests
// =============================================================================

TEST(simple_function) {
    std::string result = compile("fn add(a: I32, b: I32): I32 => a + b; add(2, 3)", "js");
    assertContains("function add(a, b)", result);
    assertContains("return (a + b)", result);
}

TEST(function_block_body) {
    std::string result = compile("fn foo(): I32 => { return 42; } foo()", "js");
    assertContains("function foo()", result);
    assertContains("return 42", result);
}

// =============================================================================
// Structs Tests
// =============================================================================

TEST(simple_struct) {
    std::string result = compile("struct Point { x: I32, y: I32 } let p = Point { 10, 20 }; p.x", "js");
    assertContains("const p = { x: 10, y: 20 }", result);
}

// =============================================================================
// Control Flow Tests  
// =============================================================================

TEST(if_expression) {
    std::string result = compile("let x = if (true) 1 else 2; x", "js");
    assertContains("true ? 1 : 2", result);
}

TEST(while_loop) {
    std::string result = compile("let mut x = 0; while (x < 10) { x = x + 1; } x", "js");
    assertContains("while ((x < 10))", result);
}

// =============================================================================
// C++ Target Tests
// =============================================================================

TEST(cpp_simple_variable) {
    std::string result = compile("let x = 10; x", "cpp");
    assertContains("const int32_t x = 10;", result);
    assertContains("return x;", result);
}

TEST(cpp_mutable_variable) {
    std::string result = compile("let mut x = 10; x = 20; x", "cpp");
    assertContains("int32_t x = 10;", result);
    assertContains("x = 20;", result);
}

// =============================================================================
// Main
// =============================================================================

int main() {
    return RUN_TESTS();
}
