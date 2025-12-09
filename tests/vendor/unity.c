#include "unity.h"
#include <string.h>

static int g_failures = 0;

int UnityBegin(const char *ignored)
{
	(void)ignored;
	g_failures = 0;
	printf("---- Unity Minimal ----\n");
	return 0;
}

int UnityEnd(void)
{
	if (g_failures == 0)
	{
		printf("ALL TESTS PASSED\n");
	}
	else
	{
		printf("%d TEST(S) FAILED\n", g_failures);
	}
	return g_failures;
}

void UnityPrint(const char *msg) { printf("%s\n", msg); }

void UnityAssertEqualString(const char *expected, const char *actual, const char *message, int line)
{
	(void)message;
	if (expected == NULL && actual == NULL)
		return;
	if (expected == NULL || actual == NULL)
	{
		g_failures++;
		printf("FAIL [%d]: expected %s but got %s\n", line, expected ? expected : "(null)", actual ? actual : "(null)");
		return;
	}
	if (strcmp(expected, actual) != 0)
	{
		g_failures++;
		printf("FAIL [%d]: expected '%s' but got '%s'\n", line, expected, actual);
	}
}
