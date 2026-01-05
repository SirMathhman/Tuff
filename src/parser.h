#ifndef SAFEC_PARSER_H
#define SAFEC_PARSER_H

#include "lexer.h"
#include "ast.h"

typedef struct
{
	Lexer lexer;
	Token current;
	Token previous;
	int had_error;
	int panic_mode;
	char error_message[256];
} Parser;

void parser_init(Parser *parser, const char *source);
ASTNode *parser_parse(Parser *parser);
const char *parser_get_error(Parser *parser);

#endif // SAFEC_PARSER_H
