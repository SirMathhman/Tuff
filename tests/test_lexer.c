#include <stdio.h>
#include <string.h>
#include <assert.h>
#include "../src/lexer.h"

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) static void test_##name(void)
#define RUN_TEST(name)                \
	do                                  \
	{                                   \
		printf("  Running %s...", #name); \
		test_##name();                    \
		printf(" PASSED\n");              \
		tests_passed++;                   \
	} while (0)

#define ASSERT_EQ(expected, actual)                                                                  \
	do                                                                                                 \
	{                                                                                                  \
		if ((expected) != (actual))                                                                      \
		{                                                                                                \
			printf(" FAILED at line %d: expected %d, got %d\n", __LINE__, (int)(expected), (int)(actual)); \
			tests_failed++;                                                                                \
			return;                                                                                        \
		}                                                                                                \
	} while (0)

#define ASSERT_STR_EQ(expected, actual, len)                     \
	do                                                             \
	{                                                              \
		if (strncmp((expected), (actual), (len)) != 0)               \
		{                                                            \
			printf(" FAILED at line %d: string mismatch\n", __LINE__); \
			tests_failed++;                                            \
			return;                                                    \
		}                                                            \
	} while (0)

TEST(empty_input)
{
	Lexer lexer;
	lexer_init(&lexer, "");
	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_EOF, token.type);
}

TEST(single_identifier)
{
	Lexer lexer;
	lexer_init(&lexer, "hello");
	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_EQ(5, token.length);
	ASSERT_STR_EQ("hello", token.start, token.length);
}

TEST(keywords)
{
	Lexer lexer;
	lexer_init(&lexer, "struct void int char return if else while for");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_STRUCT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_VOID, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_INT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_CHAR, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_RETURN, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IF, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_ELSE, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_WHILE, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_FOR, token.type);
}

TEST(type_parameter_syntax)
{
	// This is the key SafeC feature: struct Name<T> { ... }
	Lexer lexer;
	lexer_init(&lexer, "struct Wrapper<T>{ T value; };");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_STRUCT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("Wrapper", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_LT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("T", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_GT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_LBRACE, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("T", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("value", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_SEMICOLON, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_RBRACE, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_SEMICOLON, token.type);
}

TEST(generic_function_syntax)
{
	// void accept<T>(T value) { ... }
	Lexer lexer;
	lexer_init(&lexer, "void accept<T>(T value) { return; }");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_VOID, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("accept", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_LT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("T", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_GT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_LPAREN, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("T", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("value", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_RPAREN, token.type);
}

TEST(multiple_type_params)
{
	// struct Pair<K, V> { K key; V value; };
	Lexer lexer;
	lexer_init(&lexer, "struct Pair<K, V>{ K key; V value; };");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_STRUCT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("Pair", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_LT, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("K", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_COMMA, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_IDENTIFIER, token.type);
	ASSERT_STR_EQ("V", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_GT, token.type);
}

TEST(numbers)
{
	Lexer lexer;
	lexer_init(&lexer, "42 3.14 1e10 0xff");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_NUMBER, token.type);
	ASSERT_STR_EQ("42", token.start, token.length);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_NUMBER, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_NUMBER, token.type);
}

TEST(strings)
{
	Lexer lexer;
	lexer_init(&lexer, "\"hello world\" \"escaped \\\"quote\\\"\"");

	Token token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_STRING, token.type);

	token = lexer_next_token(&lexer);
	ASSERT_EQ(TOK_STRING, token.type);
}

TEST(operators)
{
	Lexer lexer;
	lexer_init(&lexer, "+ - * / == != <= >= && || -> ++ --");

	ASSERT_EQ(TOK_PLUS, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_MINUS, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_STAR, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_SLASH, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_EQ, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_NE, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_LE, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_GE, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_AND, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_OR, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_ARROW, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_INC, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_DEC, lexer_next_token(&lexer).type);
}

TEST(comments)
{
	Lexer lexer;
	lexer_init(&lexer, "int /* comment */ x // line comment\n;");

	ASSERT_EQ(TOK_INT, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_IDENTIFIER, lexer_next_token(&lexer).type);
	ASSERT_EQ(TOK_SEMICOLON, lexer_next_token(&lexer).type);
}

int main(void)
{
	printf("Running Lexer Tests:\n");

	RUN_TEST(empty_input);
	RUN_TEST(single_identifier);
	RUN_TEST(keywords);
	RUN_TEST(type_parameter_syntax);
	RUN_TEST(generic_function_syntax);
	RUN_TEST(multiple_type_params);
	RUN_TEST(numbers);
	RUN_TEST(strings);
	RUN_TEST(operators);
	RUN_TEST(comments);

	printf("\n%d tests passed, %d tests failed\n", tests_passed, tests_failed);
	return tests_failed > 0 ? 1 : 0;
}
