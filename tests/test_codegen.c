#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/parser.h"
#include "../src/codegen.h"

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

#define ASSERT(cond)                                       \
	do                                                       \
	{                                                        \
		if (!(cond))                                           \
		{                                                      \
			printf(" FAILED at line %d: %s\n", __LINE__, #cond); \
			tests_failed++;                                      \
			return;                                              \
		}                                                      \
	} while (0)

#define ASSERT_CONTAINS(haystack, needle)                                        \
	do                                                                             \
	{                                                                              \
		if (strstr((haystack), (needle)) == NULL)                                    \
		{                                                                            \
			printf(" FAILED at line %d: expected to find '%s'\n", __LINE__, (needle)); \
			tests_failed++;                                                            \
			return;                                                                    \
		}                                                                            \
	} while (0)

#define ASSERT_NOT_CONTAINS(haystack, needle)                                          \
	do                                                                                   \
	{                                                                                    \
		if (strstr((haystack), (needle)) != NULL)                                          \
		{                                                                                  \
			printf(" FAILED at line %d: did not expect to find '%s'\n", __LINE__, (needle)); \
			tests_failed++;                                                                  \
			return;                                                                          \
		}                                                                                  \
	} while (0)

static char *generate(const char *source)
{
	Parser parser;
	parser_init(&parser, source);
	ASTNode *ast = parser_parse(&parser);

	if (parser.had_error)
	{
		printf("Parse error: %s\n", parser_get_error(&parser));
		ast_free(ast);
		return NULL;
	}

	// Write to a temporary buffer via tmpfile
	FILE *tmp = tmpfile();
	if (!tmp)
	{
		ast_free(ast);
		return NULL;
	}

	CodeGen gen;
	codegen_init(&gen, tmp, ast);
	codegen_generate(&gen);
	codegen_free(&gen);

	// Read back the result
	fseek(tmp, 0, SEEK_END);
	long size = ftell(tmp);
	fseek(tmp, 0, SEEK_SET);

	char *result = (char *)malloc(size + 1);
	fread(result, 1, size, tmp);
	result[size] = '\0';

	fclose(tmp);
	ast_free(ast);

	return result;
}

TEST(simple_function)
{
	char *output = generate("int main() { return 0; }");
	ASSERT(output != NULL);
	ASSERT_CONTAINS(output, "int main()");
	ASSERT_CONTAINS(output, "return 0;");
	free(output);
}

TEST(generic_struct_instantiation)
{
	const char *source =
			"struct Wrapper<T> { T value; };\n"
			"int main() {\n"
			"    Wrapper<int> w;\n"
			"    return 0;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Should have generated Wrapper_int struct
	ASSERT_CONTAINS(output, "struct Wrapper_int");
	ASSERT_CONTAINS(output, "int value;");

	// Should NOT have the generic template in output
	ASSERT_NOT_CONTAINS(output, "struct Wrapper<T>");
	ASSERT_NOT_CONTAINS(output, "<T>");

	free(output);
}

TEST(generic_struct_multiple_instantiations)
{
	const char *source =
			"struct Box<T> { T data; };\n"
			"int main() {\n"
			"    Box<int> a;\n"
			"    Box<char> b;\n"
			"    return 0;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Should have both instantiations
	ASSERT_CONTAINS(output, "struct Box_int");
	ASSERT_CONTAINS(output, "int data;");
	ASSERT_CONTAINS(output, "struct Box_char");

	free(output);
}

TEST(generic_function_instantiation)
{
	const char *source =
			"T identity<T>(T x) { return x; }\n"
			"int main() {\n"
			"    int y = identity<int>(42);\n"
			"    return y;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Should have generated identity_int function
	ASSERT_CONTAINS(output, "int identity_int(int x)");
	ASSERT_CONTAINS(output, "return x;");

	// Call should use mangled name
	ASSERT_CONTAINS(output, "identity_int(42)");

	// Should NOT have the generic template
	ASSERT_NOT_CONTAINS(output, "identity<T>");
	ASSERT_NOT_CONTAINS(output, "<int>");

	free(output);
}

TEST(generic_pair_struct)
{
	const char *source =
			"struct Pair<K, V> { K key; V value; };\n"
			"int main() {\n"
			"    Pair<int, char> p;\n"
			"    return 0;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Should have Pair_int_char
	ASSERT_CONTAINS(output, "struct Pair_int_char");
	ASSERT_CONTAINS(output, "int key;");
	ASSERT_CONTAINS(output, "char value;");

	free(output);
}

TEST(non_generic_preserved)
{
	const char *source =
			"struct Point { int x; int y; };\n"
			"int add(int a, int b) { return a + b; }\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Non-generic struct should be preserved
	ASSERT_CONTAINS(output, "struct Point");
	ASSERT_CONTAINS(output, "int x;");
	ASSERT_CONTAINS(output, "int y;");

	// Non-generic function should be preserved
	ASSERT_CONTAINS(output, "int add(int a, int b)");

	free(output);
}

TEST(pointer_types_in_generics)
{
	const char *source =
			"struct Ptr<T> { T data; };\n"
			"int main() {\n"
			"    Ptr<int*> p;\n"
			"    return 0;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	// Should handle pointer type in instantiation
	ASSERT_CONTAINS(output, "Ptr_int_ptr");
	ASSERT_CONTAINS(output, "int* data;");

	free(output);
}

TEST(mangle_name_function)
{
	// Test the mangle_name utility directly
	TypeRef *arg = type_ref_new("int");
	char *name = mangle_name("Wrapper", arg);
	ASSERT(strcmp(name, "Wrapper_int") == 0);
	free(name);
	ast_free_type_ref(arg);

	// Test with pointer
	arg = type_ref_new("int");
	arg->pointer_level = 1;
	name = mangle_name("Box", arg);
	ASSERT(strcmp(name, "Box_int_ptr") == 0);
	free(name);
	ast_free_type_ref(arg);

	// Test with multiple args
	TypeRef *arg1 = type_ref_new("int");
	TypeRef *arg2 = type_ref_new("char");
	arg1->next = arg2;
	name = mangle_name("Pair", arg1);
	ASSERT(strcmp(name, "Pair_int_char") == 0);
	free(name);
	ast_free_type_ref(arg1);
}

TEST(control_flow_preserved)
{
	const char *source =
			"int test(int x) {\n"
			"    if (x > 0) { return 1; }\n"
			"    while (x < 0) { x++; }\n"
			"    for (i = 0; i < 10; i++) { }\n"
			"    return 0;\n"
			"}\n";

	char *output = generate(source);
	ASSERT(output != NULL);

	ASSERT_CONTAINS(output, "if (");
	ASSERT_CONTAINS(output, "while (");
	ASSERT_CONTAINS(output, "for (");

	free(output);
}

int main(void)
{
	printf("Running CodeGen Tests:\n");

	RUN_TEST(simple_function);
	RUN_TEST(generic_struct_instantiation);
	RUN_TEST(generic_struct_multiple_instantiations);
	RUN_TEST(generic_function_instantiation);
	RUN_TEST(generic_pair_struct);
	RUN_TEST(non_generic_preserved);
	RUN_TEST(pointer_types_in_generics);
	RUN_TEST(mangle_name_function);
	RUN_TEST(control_flow_preserved);

	printf("\n%d tests passed, %d tests failed\n", tests_passed, tests_failed);
	return tests_failed > 0 ? 1 : 0;
}
