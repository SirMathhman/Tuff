#ifndef UNITY_H
#define UNITY_H

#include <stdio.h>

// Minimal Unity-like test API used for small unit tests in this exercise.
int UnityBegin(const char *ignored);
int UnityEnd(void);
void UnityPrint(const char *msg);
void UnityAssertEqualString(const char *expected, const char *actual, const char *message, int line);

#define UNITY_BEGIN() UnityBegin(__FILE__)
#define UNITY_END() UnityEnd()
#define RUN_TEST(test)              \
	do                                \
	{                                 \
		printf("RUNNING: %s\n", #test); \
		test();                         \
	} while (0)
#define TEST_ASSERT_EQUAL_STRING(expected, actual) UnityAssertEqualString(expected, actual, NULL, __LINE__)

#endif // UNITY_H
