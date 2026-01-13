#include <limits.h>
#include <stdio.h>
#include <string.h>
#include "interpret.h"

static const char *g_current_test = "<none>";
static int g_failures = 0;

static void begin_test(const char *name)
{
	g_current_test = name;
	fprintf(stderr, "\n[TEST] %s\n", g_current_test);
	fflush(stderr);
}

static void fail_eq_int(const char *expr, int actual, int expected, const char *file, int line)
{
	g_failures++;
	fprintf(stderr, "[FAIL] %s:%d (%s) in %s\n", file, line, expr, g_current_test);
	fprintf(stderr, "       expected=%d actual=%d\n", expected, actual);
	fflush(stderr);
}

// IMPORTANT: prints the case BEFORE calling interpret(), so timeouts show the last input attempted.
#define EXPECT_INTERPRET_EQ(INPUT_STR, EXPECTED_INT)                                                      \
	do                                                                                                     \
	{                                                                                                      \
		const char *_case = (INPUT_STR);                                                                     \
		int _expected = (EXPECTED_INT);                                                                      \
		fprintf(stderr, "  case: interpret(\"%s\")\n", _case);                                           \
		fflush(stderr);                                                                                      \
		int _actual = interpret(_case);                                                                      \
		if (_actual != _expected)                                                                            \
			fail_eq_int("interpret(\"...\")", _actual, _expected, __FILE__, __LINE__);                    \
	} while (0)

static void test_literals_and_suffixes(void)
{
	begin_test("literals_and_suffixes");

	/* existing behavior: non-numeric input returns 0 */
	EXPECT_INTERPRET_EQ("hello", 0);

	/* new behavior: numeric input should be parsed */
	EXPECT_INTERPRET_EQ("100", 100);
	/* accept numeric suffixes like U8 */
	EXPECT_INTERPRET_EQ("100U8", 100);
	/* negative numbers indicate lower-bound error */
	EXPECT_INTERPRET_EQ("-100U8", INT_MIN);
	/* U8 suffix limits range to 0-255 */
	EXPECT_INTERPRET_EQ("256U8", INT_MIN);

	/* Unsigned suffixes */
	EXPECT_INTERPRET_EQ("65535U16", (65535 > INT_MAX ? INT_MAX : 65535));
	EXPECT_INTERPRET_EQ("65536U16", INT_MIN);
	EXPECT_INTERPRET_EQ("4294967295U32", INT_MAX); /* Clamped to INT_MAX since return is int */
	EXPECT_INTERPRET_EQ("-1U32", INT_MIN);

	/* Signed suffixes */
	EXPECT_INTERPRET_EQ("127I8", 127);
	EXPECT_INTERPRET_EQ("128I8", INT_MIN);
	EXPECT_INTERPRET_EQ("-128I8", -128);
	EXPECT_INTERPRET_EQ("-129I8", INT_MIN);

	EXPECT_INTERPRET_EQ("32767I16", 32767);
	EXPECT_INTERPRET_EQ("32768I16", INT_MIN);
}

static void test_arithmetic(void)
{
	begin_test("arithmetic");

	/* Addition and Subtraction */
	EXPECT_INTERPRET_EQ("1 + 2 + 3", 6);
	EXPECT_INTERPRET_EQ("2 + 3 - 4", 1);
	/* Multiplication, Division and Precedence */
	EXPECT_INTERPRET_EQ("2 * 3 - 4", 2);
	EXPECT_INTERPRET_EQ("2 + 3 * 4", 14);
	EXPECT_INTERPRET_EQ("4 + 2 * 3", 10);
	EXPECT_INTERPRET_EQ("10 / 2 + 1", 6);
	EXPECT_INTERPRET_EQ("12 / 0", INT_MIN);
}

static void test_blocks_and_lets(void)
{
	begin_test("blocks_and_lets");

	/* Parentheses and Braces */
	EXPECT_INTERPRET_EQ("12 / (4 - 1)", 4);
	EXPECT_INTERPRET_EQ("12 / ({ 4 } - 1)", 4);
	EXPECT_INTERPRET_EQ("12 / ({ let x : I32 = 4; x } - 1)", 4);
	EXPECT_INTERPRET_EQ("12 / ({ let x : I32 = 4; } - 1)", INT_MIN);
	EXPECT_INTERPRET_EQ("{ let a = 10; let b = 20; a + b }", 30);
	EXPECT_INTERPRET_EQ("(2 + 3) * 4", 20);
	EXPECT_INTERPRET_EQ("100 + 200", 300);
	EXPECT_INTERPRET_EQ("let y : I32 = 12 / ({ let x : I32 = 4; x } - 1); y", 4);
}

int main(void)
{
	// Make sure progress lines show up even if the process hangs and gets killed.
	setvbuf(stdout, NULL, _IONBF, 0);
	setvbuf(stderr, NULL, _IONBF, 0);

	test_literals_and_suffixes();
	test_arithmetic();
	test_blocks_and_lets();

	if (g_failures == 0)
	{
		fprintf(stderr, "\n[PASS] all tests\n");
		return 0;
	}

	fprintf(stderr, "\n[FAIL] %d failure(s)\n", g_failures);
	return 1;
}
