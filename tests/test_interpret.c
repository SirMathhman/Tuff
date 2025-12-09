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

void test_interpret_strips_u8_suffix(void)
{
	char *out = interpret("100U8");
	TEST_ASSERT_EQUAL_STRING("100", out);
	free(out);
}

void test_interpret_negative_u8_returns_error(void)
{
	char *out = interpret("-100U8");
	TEST_ASSERT_EQUAL_STRING("Error", out);
	free(out);
}

void test_interpret_u8_out_of_range_returns_error(void)
{
	char *out = interpret("256U8");
	TEST_ASSERT_EQUAL_STRING("Error", out);
	free(out);
}

void test_interpret_u16_valid_and_invalid(void)
{
	char *ok = interpret("65535U16");
	TEST_ASSERT_EQUAL_STRING("65535", ok);
	free(ok);

	char *bad = interpret("65536U16");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_u32_valid_and_invalid(void)
{
	char *ok = interpret("4294967295U32");
	TEST_ASSERT_EQUAL_STRING("4294967295", ok);
	free(ok);

	char *bad = interpret("4294967296U32");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_u64_valid_and_invalid(void)
{
	char *ok = interpret("18446744073709551615U64");
	TEST_ASSERT_EQUAL_STRING("18446744073709551615", ok);
	free(ok);

	char *bad = interpret("18446744073709551616U64");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_i8_valid_and_invalid(void)
{
	char *ok = interpret("-128I8");
	TEST_ASSERT_EQUAL_STRING("-128", ok);
	free(ok);

	char *bad = interpret("-129I8");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_i16_valid_and_invalid(void)
{
	char *ok = interpret("32767I16");
	TEST_ASSERT_EQUAL_STRING("32767", ok);
	free(ok);

	char *bad = interpret("32768I16");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_i32_valid_and_invalid(void)
{
	char *ok = interpret("2147483647I32");
	TEST_ASSERT_EQUAL_STRING("2147483647", ok);
	free(ok);

	char *bad = interpret("2147483648I32");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_i64_valid_and_invalid(void)
{
	char *ok = interpret("9223372036854775807I64");
	TEST_ASSERT_EQUAL_STRING("9223372036854775807", ok);
	free(ok);

	char *bad = interpret("9223372036854775808I64");
	TEST_ASSERT_EQUAL_STRING("Error", bad);
	free(bad);
}

void test_interpret_addition_u8(void)
{
	char *sum = interpret("100U8 + 50U8");
	TEST_ASSERT_EQUAL_STRING("150", sum);
	free(sum);

	char *overflow = interpret("200U8 + 100U8");
	TEST_ASSERT_EQUAL_STRING("Error", overflow);
	free(overflow);

	char *overflow2 = interpret("100U8 + 200U8");
	TEST_ASSERT_EQUAL_STRING("Error", overflow2);
	free(overflow2);

	char *mismatch = interpret("100U8 + 50I16");
	TEST_ASSERT_EQUAL_STRING("Error", mismatch);
	free(mismatch);

	char *sum3 = interpret("1U8 + 2U8 + 3U8");
	TEST_ASSERT_EQUAL_STRING("6", sum3);
	free(sum3);

	char *overflow3 = interpret("100U8 + 100U8 + 100U8");
	TEST_ASSERT_EQUAL_STRING("Error", overflow3);
	free(overflow3);
}

void test_interpret_addition_and_subtraction_u8(void)
{
	char *expr = interpret("10U8 - 2U8 + 3U8");
	TEST_ASSERT_EQUAL_STRING("11", expr);
	free(expr);

	char *under = interpret("5U8 - 10U8");
	TEST_ASSERT_EQUAL_STRING("Error", under);
	free(under);

	char *mixerr = interpret("10U8 - 2I8");
	TEST_ASSERT_EQUAL_STRING("Error", mixerr);
	free(mixerr);
}

void test_interpret_multiplication_and_precedence(void)
{
	char *res = interpret("10U8 * 2U8 - 3U8");
	TEST_ASSERT_EQUAL_STRING("17", res);
	free(res);

	char *ov = interpret("128U8 * 2U8");
	TEST_ASSERT_EQUAL_STRING("Error", ov);
	free(ov);

	char *mix = interpret("10U8 * 2I8");
	TEST_ASSERT_EQUAL_STRING("Error", mix);
	free(mix);
}

void test_interpret_parentheses_grouping(void)
{
	char *res = interpret("(1U8 + 2U8) * 3U8");
	TEST_ASSERT_EQUAL_STRING("9", res);
	free(res);

	char *res2 = interpret("(10U8 - 5U8) * 2U8");
	TEST_ASSERT_EQUAL_STRING("10", res2);
	free(res2);
}

void test_interpret_leading_minus_converts_to_signed(void)
{
	char *res = interpret("-3U8 + 10U8 * 2U8");
	TEST_ASSERT_EQUAL_STRING("17", res);
	free(res);

	char *res2 = interpret("-3I8 + 10I8 * 2I8");
	TEST_ASSERT_EQUAL_STRING("17", res2);
	free(res2);
}

int main(void)
{
	UNITY_BEGIN();
	RUN_TEST(test_interpret_returns_stub_for_input);
	RUN_TEST(test_interpret_null_returns_null);
	RUN_TEST(test_interpret_strips_u8_suffix);
	RUN_TEST(test_interpret_negative_u8_returns_error);
	RUN_TEST(test_interpret_u8_out_of_range_returns_error);
	RUN_TEST(test_interpret_u16_valid_and_invalid);
	RUN_TEST(test_interpret_u32_valid_and_invalid);
	RUN_TEST(test_interpret_u64_valid_and_invalid);
	RUN_TEST(test_interpret_i8_valid_and_invalid);
	RUN_TEST(test_interpret_i16_valid_and_invalid);
	RUN_TEST(test_interpret_i32_valid_and_invalid);
	RUN_TEST(test_interpret_i64_valid_and_invalid);
	RUN_TEST(test_interpret_addition_u8);
	RUN_TEST(test_interpret_addition_and_subtraction_u8);
	RUN_TEST(test_interpret_multiplication_and_precedence);
	RUN_TEST(test_interpret_parentheses_grouping);
	RUN_TEST(test_interpret_leading_minus_converts_to_signed);
	return UNITY_END();
}
