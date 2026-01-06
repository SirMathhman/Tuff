#include "interpret.h"
#include <assert.h>
#include <stdio.h>

static void should_eval(const char *s, int expected) {
	interpret_result result = interpret(s);
	assert(result.ok);
	if (!result.ok) return; /* defend against crashy asserts in CI */
	assert(result.value == expected);
}

static void should_error(const char *s) {
	interpret_result r = interpret(s);
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
	printf("basic tests passed\n");
}

int main(void) {
	test_stub_returns_negative_one();
	puts("ALL TESTS PASSED");
	return 0;
}
