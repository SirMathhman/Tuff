#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lexer.h"
#include "parser.h"
#include "codegen.h"

static void print_usage(const char *program)
{
	fprintf(stderr, "SafeC Compiler - C with Type Parameters\n\n");
	fprintf(stderr, "Usage: %s [options] <input.safec>\n\n", program);
	fprintf(stderr, "Options:\n");
	fprintf(stderr, "  -o <file>    Output file (default: stdout)\n");
	fprintf(stderr, "  -h, --help   Show this help message\n");
	fprintf(stderr, "  --ast        Print AST (for debugging)\n");
	fprintf(stderr, "  --tokens     Print tokens (for debugging)\n");
}

static char *read_file(const char *path)
{
	FILE *file = fopen(path, "rb");
	if (!file)
	{
		fprintf(stderr, "Error: Could not open file '%s'\n", path);
		return NULL;
	}

	fseek(file, 0, SEEK_END);
	long size = ftell(file);
	fseek(file, 0, SEEK_SET);

	char *buffer = (char *)malloc(size + 1);
	if (!buffer)
	{
		fprintf(stderr, "Error: Out of memory\n");
		fclose(file);
		return NULL;
	}

	size_t read = fread(buffer, 1, size, file);
	buffer[read] = '\0';

	fclose(file);
	return buffer;
}

static void print_tokens(const char *source)
{
	Lexer lexer;
	lexer_init(&lexer, source);

	Token token;
	do
	{
		token = lexer_next_token(&lexer);
		printf("%3d:%-3d %-15s '", token.line, token.column, token_type_name(token.type));
		fwrite(token.start, 1, token.length, stdout);
		printf("'\n");
	} while (token.type != TOK_EOF && token.type != TOK_ERROR);
}

int main(int argc, char *argv[])
{
	const char *input_file = NULL;
	const char *output_file = NULL;
	int print_ast_flag = 0;
	int print_tokens_flag = 0;

	// Parse arguments
	for (int i = 1; i < argc; i++)
	{
		if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0)
		{
			print_usage(argv[0]);
			return 0;
		}
		else if (strcmp(argv[i], "-o") == 0)
		{
			if (i + 1 >= argc)
			{
				fprintf(stderr, "Error: -o requires an argument\n");
				return 1;
			}
			output_file = argv[++i];
		}
		else if (strcmp(argv[i], "--ast") == 0)
		{
			print_ast_flag = 1;
		}
		else if (strcmp(argv[i], "--tokens") == 0)
		{
			print_tokens_flag = 1;
		}
		else if (argv[i][0] == '-')
		{
			fprintf(stderr, "Error: Unknown option '%s'\n", argv[i]);
			return 1;
		}
		else
		{
			input_file = argv[i];
		}
	}

	if (!input_file)
	{
		print_usage(argv[0]);
		return 1;
	}

	// Read source file
	char *source = read_file(input_file);
	if (!source)
	{
		return 1;
	}

	// Print tokens if requested
	if (print_tokens_flag)
	{
		printf("=== Tokens ===\n");
		print_tokens(source);
		printf("\n");
	}

	// Parse
	Parser parser;
	parser_init(&parser, source);
	ASTNode *ast = parser_parse(&parser);

	if (parser.had_error)
	{
		fprintf(stderr, "%s\n", parser_get_error(&parser));
		free(source);
		ast_free(ast);
		return 1;
	}

	// Print AST if requested
	if (print_ast_flag)
	{
		printf("=== AST ===\n");
		ast_print(ast, 0);
		printf("\n");
	}

	// Generate code
	FILE *output = stdout;
	if (output_file)
	{
		output = fopen(output_file, "w");
		if (!output)
		{
			fprintf(stderr, "Error: Could not open output file '%s'\n", output_file);
			free(source);
			ast_free(ast);
			return 1;
		}
	}

	CodeGen gen;
	codegen_init(&gen, output, ast);
	codegen_generate(&gen);
	codegen_free(&gen);

	if (output_file)
	{
		fclose(output);
	}

	// Cleanup
	free(source);
	ast_free(ast);

	return 0;
}
