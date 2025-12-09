#include "../tests/vendor/unity.h"
#include "../src/interpret.h"
#include <stdlib.h>

void setUp(void) {}
void tearDown(void) {}

void test_interpret_returns_stub_for_input(void)
{
	char *out = interpret("hello");
	TEST_ASSERT_EQUAL_STRING("stubbed", out);
	free(out);
}

void test_interpret_null_returns_null(void)
{
	char *out = interpret(NULL);
	TEST_ASSERT_EQUAL_STRING(NULL, out);
}

int main(void)
{
	UNITY_BEGIN();
	RUN_TEST(test_interpret_returns_stub_for_input);
	RUN_TEST(test_interpret_null_returns_null);
	return UNITY_END();
}
