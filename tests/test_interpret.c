#include "interpret.h"
#include <assert.h>
#include <stdio.h>

static void test_stub_returns_negative_one(void) {
	assert(interpret("") == -1);
	assert(interpret("any string") == -1);
	assert(interpret(NULL) == -1);
	/* New test: parse decimal integer */
	assert(interpret("100") == 100);
	/* New test: simple addition */
	assert(interpret("1 + 2") == 3);
	assert(interpret("1+2") == 3);
	/* New test: chained addition */
	assert(interpret("1 + 2 + 3") == 6);
	assert(interpret("1+2+3") == 6);
	/* New test: mixed left-associative operators */
	assert(interpret("10 - 5 + 3") == 8);
	assert(interpret("10-5+3") == 8);
	/* New test: multiplication then addition */
	assert(interpret("10 * 5 + 3") == 53);
	assert(interpret("10*5+3") == 53);
	printf("basic tests passed\n");
}

int main(void) {
	test_stub_returns_negative_one();
	puts("ALL TESTS PASSED");
	return 0;
}
