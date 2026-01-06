#include "interpret.h"
#include <assert.h>
#include <stdio.h>

static void should_eval(const char *s, int expected) {
	interpret_result result = interpret(s);
	if (!result.ok) {
		fprintf(stderr, "Test FAILED (interpret returned error): input='%s' err=%d\n", s,
		        result.err);
	}
	assert(result.ok);
	if (!result.ok) return; /* defend against crashy asserts in CI */
	if (result.value != expected) {
		fprintf(stderr, "Test FAILED (wrong value): input='%s' expected=%d got=%d\n", s, expected,
		        result.value);
	}
	assert(result.value == expected);
}

static void should_error(const char *s) {
	interpret_result r = interpret(s);
	if (r.ok) {
		fprintf(stderr, "Test FAILED (expected error but got ok): input='%s' value=%d\n", s,
		        r.value);
	}
	assert(!r.ok);
}

static void test_stub_returns_negative_one(void) {
	/* Empty or invalid input */
	should_error("");
	should_error("any string");
	should_error(NULL);
	/* New test: parse decimal integer */
	should_eval("100", 100);
	/* New test: simple addition */
	should_eval("1 + 2", 3);
	should_eval("1+2", 3);
	/* New test: chained addition */
	should_eval("1 + 2 + 3", 6);
	should_eval("1+2+3", 6);
	/* New test: mixed left-associative operators */
	should_eval("10 - 5 + 3", 8);
	should_eval("10-5+3", 8);
	/* New test: multiplication then addition */
	should_eval("10 * 5 + 3", 53);
	should_eval("10*5+3", 53);
	/* New test: parentheses and precedence */
	should_eval("10 * (5 + 3)", 80);
	should_eval("10*(5+3)", 80);
	/* Division by zero should produce an error */
	should_error("10 / 0");
	should_error("10/0");
	/* Variable declaration */
	should_eval("let x : I32 = 1 + 2 + 3;", 0);
	/* The declared variable can be used in expressions */
	should_eval("x + 1", 7);
	/* Statement followed by expression should evaluate expression */
	should_eval("let x : I32 = 1 + 2 + 3; x", 6);
	/* Redeclaring the same variable should be an error */
	should_error("let x : I32 = 10; let x : I32 = 20");
	/* Short declarations without explicit type */
	should_eval("let x = 100; x", 100);
	/* Explicit Bool type rejects numeric RHS */
	should_error("let x : Bool = 100;");
	/* Bool declaration and literal */
	should_eval("let b : Bool = true; b", 1);
	should_eval("let c : Bool = false; c", 0);
	/* Bool logical operators */
	should_eval("let d : Bool = true || false; d", 1);
	should_eval("let e : Bool = true && false; e", 0);
	should_eval("let f : Bool = (true || false) && true; f", 1);
	/* Assignment tests */
	should_eval("let mut x = 0; x = 100; x", 100);
	/* Assigning to immutable variable should be an error */
	should_error("let x = 0; x = 100;");
	/* Assigning to undeclared variable should be an error */
	should_error("y = 1;");
	/* Bool assignment */
	should_eval("let mut b : Bool = false; b = true; b", 1);
	printf("basic tests passed\n");
}

int main(void) {
	test_stub_returns_negative_one();
	puts("ALL TESTS PASSED");
	return 0;
}
