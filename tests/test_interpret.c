#include <stdio.h>
#include <assert.h>
#include "interpret.h"

static void test_stub_returns_negative_one(void)
{
	assert(interpret("") == -1);
	assert(interpret("any string") == -1);
	assert(interpret(NULL) == -1);
	printf("stub tests passed\n");
}

int main(void)
{
	test_stub_returns_negative_one();
	puts("ALL TESTS PASSED");
	return 0;
}
