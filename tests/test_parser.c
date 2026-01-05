#include <stdio.h>
#include <string.h>
#include <assert.h>
#include "../src/parser.h"

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

#define ASSERT_STR_EQ(expected, actual)                                                        \
	do                                                                                           \
	{                                                                                            \
		if (strcmp((expected), (actual)) != 0)                                                     \
		{                                                                                          \
			printf(" FAILED at line %d: expected '%s', got '%s'\n", __LINE__, (expected), (actual)); \
			tests_failed++;                                                                          \
			return;                                                                                  \
		}                                                                                          \
	} while (0)

TEST(empty_program)
{
	Parser parser;
	parser_init(&parser, "");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT_EQ(AST_PROGRAM, ast->type);
	ast_free(ast);
}

TEST(simple_function)
{
	Parser parser;
	parser_init(&parser, "int main() { return 0; }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *func = ast->data.block.statements;
	ASSERT(func != NULL);
	ASSERT_EQ(AST_FUNC_DEF, func->type);
	ASSERT_STR_EQ("main", func->data.func_def.name);
	ASSERT_STR_EQ("int", func->data.func_def.return_type->name);

	ast_free(ast);
}

TEST(generic_struct)
{
	Parser parser;
	parser_init(&parser, "struct Wrapper<T> { T value; };");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *struct_def = ast->data.block.statements;
	ASSERT(struct_def != NULL);
	ASSERT_EQ(AST_STRUCT_DEF, struct_def->type);
	ASSERT_STR_EQ("Wrapper", struct_def->data.struct_def.name);

	// Check type parameter
	TypeParam *tp = struct_def->data.struct_def.type_params;
	ASSERT(tp != NULL);
	ASSERT_STR_EQ("T", tp->name);
	ASSERT(tp->next == NULL);

	// Check member
	ASTNode *member = struct_def->data.struct_def.members;
	ASSERT(member != NULL);
	ASSERT_EQ(AST_VAR_DECL, member->type);
	ASSERT_STR_EQ("T", member->data.var_decl.type->name);
	ASSERT_STR_EQ("value", member->data.var_decl.name);

	ast_free(ast);
}

TEST(generic_struct_multiple_params)
{
	Parser parser;
	parser_init(&parser, "struct Pair<K, V> { K key; V value; };");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *struct_def = ast->data.block.statements;
	ASSERT(struct_def != NULL);
	ASSERT_EQ(AST_STRUCT_DEF, struct_def->type);
	ASSERT_STR_EQ("Pair", struct_def->data.struct_def.name);

	// Check type parameters
	TypeParam *tp = struct_def->data.struct_def.type_params;
	ASSERT(tp != NULL);
	ASSERT_STR_EQ("K", tp->name);
	ASSERT(tp->next != NULL);
	ASSERT_STR_EQ("V", tp->next->name);

	ast_free(ast);
}

TEST(generic_function)
{
	Parser parser;
	parser_init(&parser, "void accept<T>(T value) { return; }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *func = ast->data.block.statements;
	ASSERT(func != NULL);
	ASSERT_EQ(AST_FUNC_DEF, func->type);
	ASSERT_STR_EQ("accept", func->data.func_def.name);

	// Check type parameter
	TypeParam *tp = func->data.func_def.type_params;
	ASSERT(tp != NULL);
	ASSERT_STR_EQ("T", tp->name);

	// Check parameter
	ASTNode *param = func->data.func_def.params;
	ASSERT(param != NULL);
	ASSERT_EQ(AST_PARAM, param->type);
	ASSERT_STR_EQ("T", param->data.param.type->name);
	ASSERT_STR_EQ("value", param->data.param.name);

	ast_free(ast);
}

TEST(generic_function_multiple_params)
{
	Parser parser;
	parser_init(&parser, "K transform<K, V>(V input) { return input; }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *func = ast->data.block.statements;
	ASSERT(func != NULL);
	ASSERT_EQ(AST_FUNC_DEF, func->type);
	ASSERT_STR_EQ("transform", func->data.func_def.name);

	// Check type parameters
	TypeParam *tp = func->data.func_def.type_params;
	ASSERT(tp != NULL);
	ASSERT_STR_EQ("K", tp->name);
	ASSERT(tp->next != NULL);
	ASSERT_STR_EQ("V", tp->next->name);

	ast_free(ast);
}

TEST(non_generic_struct)
{
	Parser parser;
	parser_init(&parser, "struct Point { int x; int y; };");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *struct_def = ast->data.block.statements;
	ASSERT(struct_def != NULL);
	ASSERT_EQ(AST_STRUCT_DEF, struct_def->type);
	ASSERT_STR_EQ("Point", struct_def->data.struct_def.name);
	ASSERT(struct_def->data.struct_def.type_params == NULL);

	ast_free(ast);
}

TEST(pointer_type)
{
	Parser parser;
	parser_init(&parser, "int* ptr;");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *var = ast->data.block.statements;
	ASSERT(var != NULL);
	ASSERT_EQ(AST_VAR_DECL, var->type);
	ASSERT_EQ(1, var->data.var_decl.type->pointer_level);

	ast_free(ast);
}

TEST(function_with_pointer_param)
{
	Parser parser;
	parser_init(&parser, "void process(int* data, int count) { }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ASTNode *func = ast->data.block.statements;
	ASSERT(func != NULL);
	ASSERT_EQ(AST_FUNC_DEF, func->type);

	ASTNode *param1 = func->data.func_def.params;
	ASSERT(param1 != NULL);
	ASSERT_EQ(1, param1->data.param.type->pointer_level);

	ASTNode *param2 = param1->next;
	ASSERT(param2 != NULL);
	ASSERT_EQ(0, param2->data.param.type->pointer_level);

	ast_free(ast);
}

TEST(function_call)
{
	Parser parser;
	parser_init(&parser, "void test() { foo(1, 2); }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ast_free(ast);
}

TEST(if_statement)
{
	Parser parser;
	parser_init(&parser, "void test() { if (x > 0) { return 1; } else { return 0; } }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ast_free(ast);
}

TEST(while_loop)
{
	Parser parser;
	parser_init(&parser, "void test() { while (i < 10) { i++; } }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ast_free(ast);
}

TEST(for_loop)
{
	Parser parser;
	parser_init(&parser, "void test() { for (i = 0; i < 10; i++) { } }");
	ASTNode *ast = parser_parse(&parser);
	ASSERT(ast != NULL);
	ASSERT(!parser.had_error);

	ast_free(ast);
}

int main(void)
{
	printf("Running Parser Tests:\n");

	RUN_TEST(empty_program);
	RUN_TEST(simple_function);
	RUN_TEST(generic_struct);
	RUN_TEST(generic_struct_multiple_params);
	RUN_TEST(generic_function);
	RUN_TEST(generic_function_multiple_params);
	RUN_TEST(non_generic_struct);
	RUN_TEST(pointer_type);
	RUN_TEST(function_with_pointer_param);
	RUN_TEST(function_call);
	RUN_TEST(if_statement);
	RUN_TEST(while_loop);
	RUN_TEST(for_loop);

	printf("\n%d tests passed, %d tests failed\n", tests_passed, tests_failed);
	return tests_failed > 0 ? 1 : 0;
}
