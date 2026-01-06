#include "interpret.h"
#include <assert.h>
#include <stdio.h>

static void test_stub_returns_negative_one(void) {
	interpret_result r;
	/* Empty or invalid input */
	r = interpret("");
	assert(!r.ok);
	r = interpret("any string");
	assert(!r.ok);
	r = interpret(NULL);
	assert(!r.ok);
	/* New test: parse decimal integer */
	r = interpret("100");
	assert(r.ok && r.value == 100);
	/* New test: simple addition */
	r = interpret("1 + 2");
	assert(r.ok && r.value == 3);
	r = interpret("1+2");
	assert(r.ok && r.value == 3);
	/* New test: chained addition */
	r = interpret("1 + 2 + 3");
	assert(r.ok && r.value == 6);
	r = interpret("1+2+3");
	assert(r.ok && r.value == 6);
	/* New test: mixed left-associative operators */
	r = interpret("10 - 5 + 3");
	assert(r.ok && r.value == 8);
	r = interpret("10-5+3");
	assert(r.ok && r.value == 8);
	/* New test: multiplication then addition */
	r = interpret("10 * 5 + 3");
	assert(r.ok && r.value == 53);
	r = interpret("10*5+3");
	assert(r.ok && r.value == 53);
	/* New test: parentheses and precedence */
	r = interpret("10 * (5 + 3)");
	assert(r.ok && r.value == 80);
	r = interpret("10*(5+3)");
	assert(r.ok && r.value == 80);
	/* Division by zero should produce an error */
	r = interpret("10 / 0");
	assert(!r.ok);
	r = interpret("10/0");
	assert(!r.ok);
	printf("basic tests passed\n");
}

int main(void) {
	test_stub_returns_negative_one();
	puts("ALL TESTS PASSED");
	return 0;
}
