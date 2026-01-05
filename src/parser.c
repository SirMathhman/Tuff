#include "parser.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Forward declarations
static ASTNode *parse_declaration(Parser *parser);
static ASTNode *parse_statement(Parser *parser);
static ASTNode *parse_expression(Parser *parser);
static ASTNode *parse_assignment(Parser *parser);
static TypeRef *parse_type(Parser *parser);

void parser_init(Parser *parser, const char *source)
{
	lexer_init(&parser->lexer, source);
	parser->had_error = 0;
	parser->panic_mode = 0;
	parser->error_message[0] = '\0';
	parser->current = lexer_next_token(&parser->lexer);
}

static void error(Parser *parser, const char *message)
{
	if (parser->panic_mode)
		return;
	parser->panic_mode = 1;
	parser->had_error = 1;
	snprintf(parser->error_message, sizeof(parser->error_message),
					 "Error at line %d: %s", parser->current.line, message);
}

static void advance(Parser *parser)
{
	parser->previous = parser->current;
	parser->current = lexer_next_token(&parser->lexer);

	if (parser->current.type == TOK_ERROR)
	{
		error(parser, parser->current.start);
	}
}

static int check(Parser *parser, TokenType type)
{
	return parser->current.type == type;
}

static int match(Parser *parser, TokenType type)
{
	if (!check(parser, type))
		return 0;
	advance(parser);
	return 1;
}

static void consume(Parser *parser, TokenType type, const char *message)
{
	if (parser->current.type == type)
	{
		advance(parser);
		return;
	}
	error(parser, message);
}

static char *token_to_string(Token *token)
{
	char *str = (char *)malloc(token->length + 1);
	memcpy(str, token->start, token->length);
	str[token->length] = '\0';
	return str;
}

// Check if current token is a type keyword or identifier that could start a type
static int is_type_start(Parser *parser)
{
	switch (parser->current.type)
	{
	case TOK_VOID:
	case TOK_INT:
	case TOK_CHAR:
	case TOK_FLOAT:
	case TOK_DOUBLE:
	case TOK_LONG:
	case TOK_SHORT:
	case TOK_UNSIGNED:
	case TOK_SIGNED:
	case TOK_CONST:
	case TOK_STRUCT:
	case TOK_ENUM:
	case TOK_UNION:
		return 1;
	case TOK_IDENTIFIER:
		// Could be a typedef'd type
		return 1;
	default:
		return 0;
	}
}

// Parse type parameters: <T> or <T, U, V>
static TypeParam *parse_type_params(Parser *parser)
{
	if (!match(parser, TOK_LT))
		return NULL;

	TypeParam *head = NULL;
	TypeParam *tail = NULL;

	do
	{
		if (parser->current.type != TOK_IDENTIFIER)
		{
			error(parser, "Expected type parameter name");
			return head;
		}

		TypeParam *param = type_param_new(token_to_string(&parser->current));
		advance(parser);

		if (!head)
		{
			head = param;
			tail = param;
		}
		else
		{
			tail->next = param;
			tail = param;
		}
	} while (match(parser, TOK_COMMA));

	consume(parser, TOK_GT, "Expected '>' after type parameters");
	return head;
}

// Parse type arguments: <int> or <int, char*>
static TypeRef *parse_type_args(Parser *parser)
{
	if (!match(parser, TOK_LT))
		return NULL;

	TypeRef *head = NULL;
	TypeRef *tail = NULL;

	do
	{
		TypeRef *arg = parse_type(parser);
		if (!arg)
		{
			error(parser, "Expected type argument");
			return head;
		}

		if (!head)
		{
			head = arg;
			tail = arg;
		}
		else
		{
			tail->next = arg;
			tail = arg;
		}
	} while (match(parser, TOK_COMMA));

	consume(parser, TOK_GT, "Expected '>' after type arguments");
	return head;
}

// Parse a type: int, char*, struct Foo, Wrapper<int>
static TypeRef *parse_type(Parser *parser)
{
	TypeRef *ref = NULL;

	// Handle const, unsigned, signed prefixes
	int is_const = match(parser, TOK_CONST);
	int is_unsigned = match(parser, TOK_UNSIGNED);
	int is_signed = match(parser, TOK_SIGNED);
	(void)is_const;
	(void)is_unsigned;
	(void)is_signed; // Used later for full implementation

	// Handle struct/enum/union
	if (match(parser, TOK_STRUCT) || match(parser, TOK_ENUM) || match(parser, TOK_UNION))
	{
		TokenType kind = parser->previous.type;

		// Check if this is an anonymous enum/struct/union with body: enum { ... }
		if (check(parser, TOK_LBRACE))
		{
			// Anonymous definition - collect the whole body as passthrough for the type
			const char *prefix = kind == TOK_STRUCT ? "struct " : (kind == TOK_ENUM ? "enum " : "union ");
			size_t cap = 256;
			size_t len = strlen(prefix);
			char *body = (char *)malloc(cap);
			strcpy(body, prefix);

			// Consume the body
			consume(parser, TOK_LBRACE, "Expected '{'");
			strcat(body, "{ ");
			len += 2;
			int brace_depth = 1;

			while (brace_depth > 0 && !check(parser, TOK_EOF))
			{
				char *part = token_to_string(&parser->current);
				size_t plen = strlen(part);
				if (len + plen + 2 >= cap)
				{
					cap *= 2;
					body = (char *)realloc(body, cap);
				}
				strcat(body, part);
				strcat(body, " ");
				len += plen + 1;
				free(part);

				if (parser->current.type == TOK_LBRACE)
					brace_depth++;
				else if (parser->current.type == TOK_RBRACE)
					brace_depth--;

				advance(parser);
			}

			ref = type_ref_new(body);
			free(body);
		}
		else if (parser->current.type != TOK_IDENTIFIER)
		{
			error(parser, "Expected name after struct/enum/union");
			return NULL;
		}
		else
		{
			char *name = token_to_string(&parser->current);
			advance(parser);

			// Build full name like "struct Foo"
			const char *prefix = kind == TOK_STRUCT ? "struct " : (kind == TOK_ENUM ? "enum " : "union ");
			char *full_name = (char *)malloc(strlen(prefix) + strlen(name) + 1);
			strcpy(full_name, prefix);
			strcat(full_name, name);
			free(name);

			ref = type_ref_new(full_name);
			free(full_name);
		}
	}
	else if (parser->current.type == TOK_VOID ||
					 parser->current.type == TOK_INT ||
					 parser->current.type == TOK_CHAR ||
					 parser->current.type == TOK_FLOAT ||
					 parser->current.type == TOK_DOUBLE ||
					 parser->current.type == TOK_LONG ||
					 parser->current.type == TOK_SHORT)
	{
		ref = type_ref_new(token_to_string(&parser->current));
		advance(parser);

		// Handle long long, long int, etc.
		while (parser->current.type == TOK_LONG ||
					 parser->current.type == TOK_INT ||
					 parser->current.type == TOK_DOUBLE)
		{
			char *old_name = ref->name;
			char *extra = token_to_string(&parser->current);
			ref->name = (char *)malloc(strlen(old_name) + strlen(extra) + 2);
			sprintf(ref->name, "%s %s", old_name, extra);
			free(old_name);
			free(extra);
			advance(parser);
		}
	}
	else if (parser->current.type == TOK_IDENTIFIER)
	{
		ref = type_ref_new(token_to_string(&parser->current));
		advance(parser);

		// Check for type arguments: Wrapper<int>
		ref->type_args = parse_type_args(parser);
	}
	else
	{
		return NULL;
	}

	// Parse pointer stars
	while (match(parser, TOK_STAR))
	{
		ref->pointer_level++;
	}

	return ref;
}

// Parse struct definition: struct Name<T> { ... };
static ASTNode *parse_struct_def(Parser *parser)
{
	consume(parser, TOK_STRUCT, "Expected 'struct'");

	if (parser->current.type != TOK_IDENTIFIER)
	{
		error(parser, "Expected struct name");
		return NULL;
	}

	ASTNode *node = ast_new_node(AST_STRUCT_DEF);
	node->data.struct_def.name = token_to_string(&parser->current);
	node->line = parser->current.line;
	advance(parser);

	// Optional type parameters
	node->data.struct_def.type_params = parse_type_params(parser);

	consume(parser, TOK_LBRACE, "Expected '{' after struct name");

	// Parse members
	ASTNode *members_head = NULL;
	ASTNode *members_tail = NULL;

	while (!check(parser, TOK_RBRACE) && !check(parser, TOK_EOF))
	{
		TypeRef *type = parse_type(parser);
		if (!type)
		{
			error(parser, "Expected type in struct member");
			break;
		}

		if (parser->current.type != TOK_IDENTIFIER)
		{
			error(parser, "Expected member name");
			ast_free_type_ref(type);
			break;
		}

		ASTNode *member = ast_new_node(AST_VAR_DECL);
		member->data.var_decl.type = type;
		member->data.var_decl.name = token_to_string(&parser->current);
		member->line = parser->current.line;
		advance(parser);

		// Handle array declaration: int arr[10];
		while (match(parser, TOK_LBRACKET))
		{
			// For now, just skip array dimensions
			while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
			{
				advance(parser);
			}
			consume(parser, TOK_RBRACKET, "Expected ']'");
		}

		consume(parser, TOK_SEMICOLON, "Expected ';' after struct member");

		if (!members_head)
		{
			members_head = member;
			members_tail = member;
		}
		else
		{
			members_tail->next = member;
			members_tail = member;
		}
	}

	consume(parser, TOK_RBRACE, "Expected '}' after struct body");
	consume(parser, TOK_SEMICOLON, "Expected ';' after struct definition");

	node->data.struct_def.members = members_head;
	return node;
}

// Parse parameter list
static ASTNode *parse_params(Parser *parser)
{
	ASTNode *head = NULL;
	ASTNode *tail = NULL;

	if (check(parser, TOK_RPAREN))
		return NULL;

	// Check for void parameter
	if (check(parser, TOK_VOID))
	{
		Token next = lexer_peek_token(&parser->lexer);
		if (next.type == TOK_RPAREN)
		{
			advance(parser); // consume void
			return NULL;
		}
	}

	do
	{
		TypeRef *type = parse_type(parser);
		if (!type)
		{
			error(parser, "Expected parameter type");
			return head;
		}

		ASTNode *param = ast_new_node(AST_PARAM);
		param->data.param.type = type;
		param->line = parser->current.line;

		if (parser->current.type == TOK_IDENTIFIER)
		{
			param->data.param.name = token_to_string(&parser->current);
			advance(parser);
		}
		else
		{
			param->data.param.name = strdup("");
		}

		// Handle array parameters: int arr[]
		while (match(parser, TOK_LBRACKET))
		{
			while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
			{
				advance(parser);
			}
			consume(parser, TOK_RBRACKET, "Expected ']'");
			type->pointer_level++; // Arrays decay to pointers
		}

		if (!head)
		{
			head = param;
			tail = param;
		}
		else
		{
			tail->next = param;
			tail = param;
		}
	} while (match(parser, TOK_COMMA));

	return head;
}

// Forward declarations for expression parsing
static ASTNode *parse_primary(Parser *parser);
static ASTNode *parse_unary(Parser *parser);
static ASTNode *parse_postfix(Parser *parser);
static ASTNode *parse_binary(Parser *parser, int min_prec);

static int get_precedence(TokenType type)
{
	switch (type)
	{
	case TOK_OR:
		return 1;
	case TOK_AND:
		return 2;
	case TOK_PIPE:
		return 3;
	case TOK_CARET:
		return 4;
	case TOK_AMPERSAND:
		return 5;
	case TOK_EQ:
	case TOK_NE:
		return 6;
	case TOK_LT:
	case TOK_GT:
	case TOK_LE:
	case TOK_GE:
		return 7;
	case TOK_LSHIFT:
	case TOK_RSHIFT:
		return 8;
	case TOK_PLUS:
	case TOK_MINUS:
		return 9;
	case TOK_STAR:
	case TOK_SLASH:
	case TOK_PERCENT:
		return 10;
	default:
		return 0;
	}
}

static ASTNode *parse_primary(Parser *parser)
{
	if (match(parser, TOK_NUMBER))
	{
		ASTNode *node = ast_new_node(AST_NUMBER);
		node->data.number.value = token_to_string(&parser->previous);
		node->line = parser->previous.line;
		return node;
	}

	if (match(parser, TOK_STRING))
	{
		ASTNode *node = ast_new_node(AST_STRING);
		node->data.string.value = token_to_string(&parser->previous);
		node->line = parser->previous.line;
		return node;
	}

	if (match(parser, TOK_CHAR_LITERAL))
	{
		ASTNode *node = ast_new_node(AST_CHAR);
		node->data.string.value = token_to_string(&parser->previous);
		node->line = parser->previous.line;
		return node;
	}

	if (match(parser, TOK_IDENTIFIER))
	{
		ASTNode *node = ast_new_node(AST_IDENTIFIER);
		node->data.ident.name = token_to_string(&parser->previous);
		node->line = parser->previous.line;
		return node;
	}

	if (match(parser, TOK_LPAREN))
	{
		// Could be a cast or grouping
		// Cast: (type)expr - if what follows is a type keyword, parse as cast
		// Grouping: (expr) - otherwise, parse as expression

		// Check if this looks like a cast by checking for type keywords
		int looks_like_cast = 0;
		switch (parser->current.type)
		{
		case TOK_VOID:
		case TOK_INT:
		case TOK_CHAR:
		case TOK_FLOAT:
		case TOK_DOUBLE:
		case TOK_LONG:
		case TOK_SHORT:
		case TOK_UNSIGNED:
		case TOK_SIGNED:
		case TOK_CONST:
		case TOK_STRUCT:
		case TOK_ENUM:
		case TOK_UNION:
			looks_like_cast = 1;
			break;
		case TOK_IDENTIFIER:
			// Could be a typedef'd type - check if next token after identifier is ) or *
			{
				Token peek = lexer_peek_token(&parser->lexer);
				if (peek.type == TOK_RPAREN || peek.type == TOK_STAR)
				{
					looks_like_cast = 1;
				}
			}
			break;
		default:
			looks_like_cast = 0;
			break;
		}

		if (looks_like_cast)
		{
			// Parse as cast
			TypeRef *cast_type = parse_type(parser);
			consume(parser, TOK_RPAREN, "Expected ')' after cast type");

			ASTNode *node = ast_new_node(AST_CAST);
			node->data.cast.type = cast_type;
			node->data.cast.expr = parse_unary(parser);
			node->line = parser->previous.line;
			return node;
		}
		else
		{
			// Parse as grouping
			ASTNode *expr = parse_expression(parser);
			consume(parser, TOK_RPAREN, "Expected ')' after expression");
			return expr;
		}
	}

	if (match(parser, TOK_SIZEOF))
	{
		ASTNode *node = ast_new_node(AST_SIZEOF);
		node->line = parser->previous.line;

		consume(parser, TOK_LPAREN, "Expected '(' after sizeof");

		// Try to parse as type first
		TypeRef *type = parse_type(parser);
		if (type && check(parser, TOK_RPAREN))
		{
			node->data.size_of.type = type;
		}
		else
		{
			// It's an expression
			ast_free_type_ref(type);
			node->data.size_of.expr = parse_expression(parser);
		}

		consume(parser, TOK_RPAREN, "Expected ')' after sizeof");
		return node;
	}

	error(parser, "Expected expression");
	return NULL;
}

static ASTNode *parse_postfix(Parser *parser)
{
	ASTNode *expr = parse_primary(parser);
	if (!expr)
		return NULL;

	for (;;)
	{
		if (match(parser, TOK_LPAREN))
		{
			// Function call
			ASTNode *call = ast_new_node(AST_CALL);
			call->data.call.callee = expr;
			call->line = parser->previous.line;

			// Parse arguments
			ASTNode *args_head = NULL;
			ASTNode *args_tail = NULL;

			if (!check(parser, TOK_RPAREN))
			{
				do
				{
					ASTNode *arg = parse_assignment(parser);
					if (!arg)
						break;

					if (!args_head)
					{
						args_head = arg;
						args_tail = arg;
					}
					else
					{
						args_tail->next = arg;
						args_tail = arg;
					}
				} while (match(parser, TOK_COMMA));
			}

			consume(parser, TOK_RPAREN, "Expected ')' after arguments");
			call->data.call.args = args_head;
			expr = call;
		}
		else if (match(parser, TOK_LBRACKET))
		{
			// Array access
			ASTNode *access = ast_new_node(AST_ARRAY_ACCESS);
			access->data.array_access.array = expr;
			access->data.array_access.index = parse_expression(parser);
			access->line = parser->previous.line;
			consume(parser, TOK_RBRACKET, "Expected ']' after index");
			expr = access;
		}
		else if (match(parser, TOK_DOT))
		{
			// Member access
			ASTNode *member = ast_new_node(AST_MEMBER_ACCESS);
			member->data.member.object = expr;
			member->data.member.is_arrow = 0;
			member->line = parser->previous.line;

			if (parser->current.type != TOK_IDENTIFIER)
			{
				error(parser, "Expected member name");
				return expr;
			}
			member->data.member.member = token_to_string(&parser->current);
			advance(parser);
			expr = member;
		}
		else if (match(parser, TOK_ARROW))
		{
			// Arrow member access
			ASTNode *member = ast_new_node(AST_MEMBER_ACCESS);
			member->data.member.object = expr;
			member->data.member.is_arrow = 1;
			member->line = parser->previous.line;

			if (parser->current.type != TOK_IDENTIFIER)
			{
				error(parser, "Expected member name");
				return expr;
			}
			member->data.member.member = token_to_string(&parser->current);
			advance(parser);
			expr = member;
		}
		else if (match(parser, TOK_INC) || match(parser, TOK_DEC))
		{
			// Postfix increment/decrement
			ASTNode *unary = ast_new_node(AST_UNARY);
			unary->data.unary.op = parser->previous.type;
			unary->data.unary.operand = expr;
			unary->data.unary.prefix = 0;
			unary->line = parser->previous.line;
			expr = unary;
		}
		else if (match(parser, TOK_LT))
		{
			// Could be generic function call: func<int>(x)
			// Only if followed by types and then >
			// For now, check if callee is identifier and treat as type args
			if (expr->type == AST_IDENTIFIER)
			{
				// Check if what follows looks like a type (identifier or keyword type)
				// If it's a number or other non-type token, this is comparison, not generic
				if (!is_type_start(parser))
				{
					// This is a comparison operator, not generic call
					// We need to handle this as a binary expression
					// Since we already consumed <, create a binary node
					ASTNode *right = parse_binary(parser, get_precedence(TOK_LT) + 1);
					if (!right)
						return expr;

					ASTNode *binary = ast_new_node(AST_BINARY);
					binary->data.binary.op = TOK_LT;
					binary->data.binary.left = expr;
					binary->data.binary.right = right;
					binary->line = parser->previous.line;
					expr = binary;
					continue;
				}

				// Additional check: if current is identifier, peek to see if next is ; or ) or other operator
				// If so, this is a comparison, not generic call
				if (parser->current.type == TOK_IDENTIFIER)
				{
					Token peek = lexer_peek_token(&parser->lexer);
					// If next token is not >, ,, or *, this is likely a comparison
					if (peek.type != TOK_GT && peek.type != TOK_COMMA && peek.type != TOK_STAR)
					{
						// This is a comparison operator
						ASTNode *right = parse_binary(parser, get_precedence(TOK_LT) + 1);
						if (!right)
							return expr;

						ASTNode *binary = ast_new_node(AST_BINARY);
						binary->data.binary.op = TOK_LT;
						binary->data.binary.left = expr;
						binary->data.binary.right = right;
						binary->line = parser->previous.line;
						expr = binary;
						continue;
					}
				}

				// Try to parse as type arguments
				TypeRef *type_args = NULL;
				TypeRef *tail = NULL;

				do
				{
					TypeRef *arg = parse_type(parser);
					if (!arg)
						break;

					if (!type_args)
					{
						type_args = arg;
						tail = arg;
					}
					else
					{
						tail->next = arg;
						tail = arg;
					}
				} while (match(parser, TOK_COMMA));

				if (!match(parser, TOK_GT))
				{
					// Not type args, backtrack (simplified - in real impl would need proper backtracking)
					error(parser, "Expected '>' after type arguments");
					ast_free_type_ref(type_args);
					return expr;
				}

				// Now expect (
				if (!match(parser, TOK_LPAREN))
				{
					error(parser, "Expected '(' after type arguments");
					ast_free_type_ref(type_args);
					return expr;
				}

				ASTNode *call = ast_new_node(AST_CALL);
				call->data.call.callee = expr;
				call->data.call.type_args = type_args;
				call->line = parser->previous.line;

				// Parse arguments
				ASTNode *args_head = NULL;
				ASTNode *args_tail = NULL;

				if (!check(parser, TOK_RPAREN))
				{
					do
					{
						ASTNode *arg = parse_assignment(parser);
						if (!arg)
							break;

						if (!args_head)
						{
							args_head = arg;
							args_tail = arg;
						}
						else
						{
							args_tail->next = arg;
							args_tail = arg;
						}
					} while (match(parser, TOK_COMMA));
				}

				consume(parser, TOK_RPAREN, "Expected ')' after arguments");
				call->data.call.args = args_head;
				expr = call;
			}
			else
			{
				// This was a comparison <, put it back conceptually
				// We need to backtrack - for now just error
				error(parser, "Unexpected '<'");
				return expr;
			}
		}
		else
		{
			break;
		}
	}

	return expr;
}

static ASTNode *parse_unary(Parser *parser)
{
	if (match(parser, TOK_MINUS) || match(parser, TOK_EXCLAIM) ||
			match(parser, TOK_TILDE) || match(parser, TOK_AMPERSAND) ||
			match(parser, TOK_STAR) || match(parser, TOK_INC) ||
			match(parser, TOK_DEC))
	{
		ASTNode *node = ast_new_node(AST_UNARY);
		node->data.unary.op = parser->previous.type;
		node->data.unary.prefix = 1;
		node->data.unary.operand = parse_unary(parser);
		node->line = parser->previous.line;
		return node;
	}

	return parse_postfix(parser);
}

static ASTNode *parse_binary(Parser *parser, int min_prec)
{
	ASTNode *left = parse_unary(parser);
	if (!left)
		return NULL;

	while (get_precedence(parser->current.type) >= min_prec)
	{
		TokenType op = parser->current.type;
		int prec = get_precedence(op);
		advance(parser);

		ASTNode *right = parse_binary(parser, prec + 1);
		if (!right)
			return left;

		ASTNode *binary = ast_new_node(AST_BINARY);
		binary->data.binary.op = op;
		binary->data.binary.left = left;
		binary->data.binary.right = right;
		binary->line = parser->previous.line;
		left = binary;
	}

	return left;
}

static ASTNode *parse_ternary(Parser *parser)
{
	ASTNode *condition = parse_binary(parser, 1);
	if (!condition)
		return NULL;

	if (match(parser, TOK_QUESTION))
	{
		ASTNode *then_expr = parse_expression(parser);
		consume(parser, TOK_COLON, "Expected ':' in ternary expression");
		ASTNode *else_expr = parse_ternary(parser);

		// Create an if-like node for ternary
		ASTNode *node = ast_new_node(AST_IF);
		node->data.if_stmt.condition = condition;
		node->data.if_stmt.then_branch = then_expr;
		node->data.if_stmt.else_branch = else_expr;
		node->line = parser->previous.line;
		return node;
	}

	return condition;
}

static ASTNode *parse_assignment(Parser *parser)
{
	ASTNode *left = parse_ternary(parser);
	if (!left)
		return NULL;

	if (match(parser, TOK_ASSIGN) || match(parser, TOK_PLUS_ASSIGN) ||
			match(parser, TOK_MINUS_ASSIGN) || match(parser, TOK_STAR_ASSIGN) ||
			match(parser, TOK_SLASH_ASSIGN))
	{
		TokenType op = parser->previous.type;
		ASTNode *right = parse_assignment(parser);

		ASTNode *binary = ast_new_node(AST_BINARY);
		binary->data.binary.op = op;
		binary->data.binary.left = left;
		binary->data.binary.right = right;
		binary->line = parser->previous.line;
		return binary;
	}

	return left;
}

static ASTNode *parse_expression(Parser *parser)
{
	return parse_assignment(parser);
}

// Parse a block: { ... }
static ASTNode *parse_block(Parser *parser)
{
	consume(parser, TOK_LBRACE, "Expected '{'");

	ASTNode *node = ast_new_node(AST_BLOCK);
	node->line = parser->previous.line;

	ASTNode *stmts_head = NULL;
	ASTNode *stmts_tail = NULL;

	while (!check(parser, TOK_RBRACE) && !check(parser, TOK_EOF))
	{
		ASTNode *stmt = parse_statement(parser);
		if (!stmt)
		{
			if (parser->panic_mode)
			{
				// Skip to next statement
				while (!check(parser, TOK_SEMICOLON) && !check(parser, TOK_RBRACE) &&
							 !check(parser, TOK_EOF))
				{
					advance(parser);
				}
				if (check(parser, TOK_SEMICOLON))
					advance(parser);
				parser->panic_mode = 0;
				continue;
			}
			break;
		}

		if (!stmts_head)
		{
			stmts_head = stmt;
			stmts_tail = stmt;
		}
		else
		{
			stmts_tail->next = stmt;
			stmts_tail = stmt;
		}
	}

	consume(parser, TOK_RBRACE, "Expected '}'");
	node->data.block.statements = stmts_head;
	return node;
}

static ASTNode *parse_statement(Parser *parser)
{
	// Return statement
	if (match(parser, TOK_RETURN))
	{
		ASTNode *node = ast_new_node(AST_RETURN);
		node->line = parser->previous.line;

		if (!check(parser, TOK_SEMICOLON))
		{
			node->data.ret.value = parse_expression(parser);
		}

		consume(parser, TOK_SEMICOLON, "Expected ';' after return");
		return node;
	}

	// If statement
	if (match(parser, TOK_IF))
	{
		ASTNode *node = ast_new_node(AST_IF);
		node->line = parser->previous.line;

		consume(parser, TOK_LPAREN, "Expected '(' after 'if'");
		node->data.if_stmt.condition = parse_expression(parser);
		consume(parser, TOK_RPAREN, "Expected ')' after condition");

		node->data.if_stmt.then_branch = parse_statement(parser);

		if (match(parser, TOK_ELSE))
		{
			node->data.if_stmt.else_branch = parse_statement(parser);
		}

		return node;
	}

	// While statement
	if (match(parser, TOK_WHILE))
	{
		ASTNode *node = ast_new_node(AST_WHILE);
		node->line = parser->previous.line;

		consume(parser, TOK_LPAREN, "Expected '(' after 'while'");
		node->data.while_stmt.condition = parse_expression(parser);
		consume(parser, TOK_RPAREN, "Expected ')' after condition");

		node->data.while_stmt.body = parse_statement(parser);
		return node;
	}

	// Do-while statement
	if (match(parser, TOK_DO))
	{
		// do { ... } while (...);
		// Build as passthrough for simplicity
		size_t cap = 256;
		size_t len = 3;
		char *code = (char *)malloc(cap);
		strcpy(code, "do ");

		// Parse body
		if (check(parser, TOK_LBRACE))
		{
			consume(parser, TOK_LBRACE, "Expected '{'");
			strcat(code, "{ ");
			len += 2;
			int brace_depth = 1;

			while (brace_depth > 0 && !check(parser, TOK_EOF))
			{
				char *part = token_to_string(&parser->current);
				size_t plen = strlen(part);
				if (len + plen + 2 >= cap)
				{
					cap *= 2;
					code = (char *)realloc(code, cap);
				}
				strcat(code, part);
				strcat(code, " ");
				len += plen + 1;
				free(part);

				if (parser->current.type == TOK_LBRACE)
					brace_depth++;
				else if (parser->current.type == TOK_RBRACE)
					brace_depth--;

				advance(parser);
			}
		}
		else
		{
			// Single statement - parse until ;
			while (!check(parser, TOK_SEMICOLON) && !check(parser, TOK_EOF))
			{
				char *part = token_to_string(&parser->current);
				size_t plen = strlen(part);
				if (len + plen + 2 >= cap)
				{
					cap *= 2;
					code = (char *)realloc(code, cap);
				}
				strcat(code, part);
				strcat(code, " ");
				len += plen + 1;
				free(part);
				advance(parser);
			}
			consume(parser, TOK_SEMICOLON, "Expected ';'");
			strcat(code, "; ");
			len += 2;
		}

		// Parse while (...)
		consume(parser, TOK_WHILE, "Expected 'while' after do body");
		if (len + 7 >= cap)
		{
			cap *= 2;
			code = (char *)realloc(code, cap);
		}
		strcat(code, "while ");
		len += 6;

		consume(parser, TOK_LPAREN, "Expected '(' after 'while'");
		strcat(code, "( ");
		len += 2;

		while (!check(parser, TOK_RPAREN) && !check(parser, TOK_EOF))
		{
			char *part = token_to_string(&parser->current);
			size_t plen = strlen(part);
			if (len + plen + 2 >= cap)
			{
				cap *= 2;
				code = (char *)realloc(code, cap);
			}
			strcat(code, part);
			strcat(code, " ");
			len += plen + 1;
			free(part);
			advance(parser);
		}
		consume(parser, TOK_RPAREN, "Expected ')' after condition");
		strcat(code, ")");
		len += 1;

		consume(parser, TOK_SEMICOLON, "Expected ';' after do-while");

		ASTNode *node = ast_new_node(AST_PASSTHROUGH);
		node->data.passthrough.code = code;
		node->line = parser->previous.line;
		return node;
	}

	// For statement
	if (match(parser, TOK_FOR))
	{
		ASTNode *node = ast_new_node(AST_FOR);
		node->line = parser->previous.line;

		consume(parser, TOK_LPAREN, "Expected '(' after 'for'");

		// Init
		if (!check(parser, TOK_SEMICOLON))
		{
			node->data.for_stmt.init = parse_expression(parser);
		}
		consume(parser, TOK_SEMICOLON, "Expected ';' after for init");

		// Condition
		if (!check(parser, TOK_SEMICOLON))
		{
			node->data.for_stmt.condition = parse_expression(parser);
		}
		consume(parser, TOK_SEMICOLON, "Expected ';' after for condition");

		// Update
		if (!check(parser, TOK_RPAREN))
		{
			node->data.for_stmt.update = parse_expression(parser);
		}
		consume(parser, TOK_RPAREN, "Expected ')' after for clauses");

		node->data.for_stmt.body = parse_statement(parser);
		return node;
	}

	// Switch statement - for now, parse the whole thing as passthrough
	if (match(parser, TOK_SWITCH))
	{
		// Build the switch statement as passthrough text
		int brace_depth = 0;
		size_t cap = 256;
		size_t len = 7; // "switch "
		char *code = (char *)malloc(cap);
		strcpy(code, "switch ");

		// Parse the condition (...)
		consume(parser, TOK_LPAREN, "Expected '(' after 'switch'");
		code = (char *)realloc(code, cap + 1);
		strcat(code, "(");
		len++;

		while (!check(parser, TOK_RPAREN) && !check(parser, TOK_EOF))
		{
			char *part = token_to_string(&parser->current);
			size_t plen = strlen(part);
			if (len + plen + 2 >= cap)
			{
				cap *= 2;
				code = (char *)realloc(code, cap);
			}
			strcat(code, part);
			strcat(code, " ");
			len += plen + 1;
			free(part);
			advance(parser);
		}
		consume(parser, TOK_RPAREN, "Expected ')' after switch condition");
		if (len + 2 >= cap)
		{
			cap *= 2;
			code = (char *)realloc(code, cap);
		}
		strcat(code, ") ");
		len += 2;

		// Parse the body { ... }
		consume(parser, TOK_LBRACE, "Expected '{' after switch condition");
		strcat(code, "{ ");
		len += 2;
		brace_depth = 1;

		while (brace_depth > 0 && !check(parser, TOK_EOF))
		{
			char *part = token_to_string(&parser->current);
			size_t plen = strlen(part);
			if (len + plen + 2 >= cap)
			{
				cap *= 2;
				code = (char *)realloc(code, cap);
			}
			strcat(code, part);
			strcat(code, " ");
			len += plen + 1;
			free(part);

			if (parser->current.type == TOK_LBRACE)
				brace_depth++;
			else if (parser->current.type == TOK_RBRACE)
				brace_depth--;

			advance(parser);
		}

		ASTNode *node = ast_new_node(AST_PASSTHROUGH);
		node->data.passthrough.code = code;
		node->line = parser->previous.line;
		return node;
	}

	// Block
	if (check(parser, TOK_LBRACE))
	{
		return parse_block(parser);
	}

	// Break/continue
	if (match(parser, TOK_BREAK) || match(parser, TOK_CONTINUE))
	{
		ASTNode *node = ast_new_node(AST_PASSTHROUGH);
		node->data.passthrough.code = token_to_string(&parser->previous);
		consume(parser, TOK_SEMICOLON, "Expected ';'");
		return node;
	}

	// Variable declaration or expression statement
	// For identifiers, we need to distinguish between:
	// - Type followed by identifier (declaration): MyType x;
	// - Function call: foo(1, 2);
	// - Assignment: x = 5;
	// Check if this looks like a type keyword (not just identifier)
	int is_definite_type = (parser->current.type != TOK_IDENTIFIER);

	if (is_type_start(parser) && is_definite_type)
	{
		// This is definitely a type keyword, parse as declaration
		TypeRef *type = parse_type(parser);

		if (type && parser->current.type == TOK_IDENTIFIER)
		{
			// This is a variable declaration
			ASTNode *node = ast_new_node(AST_VAR_DECL);
			node->data.var_decl.type = type;
			node->data.var_decl.name = token_to_string(&parser->current);
			node->line = parser->current.line;
			advance(parser);

			// Handle array declaration
			while (match(parser, TOK_LBRACKET))
			{
				while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
				{
					advance(parser);
				}
				consume(parser, TOK_RBRACKET, "Expected ']'");
			}

			// Optional initializer
			if (match(parser, TOK_ASSIGN))
			{
				node->data.var_decl.init = parse_expression(parser);
			}

			consume(parser, TOK_SEMICOLON, "Expected ';' after variable declaration");
			return node;
		}

		// Not a declaration, clean up and fall through to expression
		ast_free_type_ref(type);
	}
	else if (parser->current.type == TOK_IDENTIFIER)
	{
		// Could be a typedef'd type or an expression
		// Use lookahead: if identifier is followed by another identifier or star, it's a declaration
		// But if it's followed by <, it could be either:
		//   - Generic type declaration: MyType<int> varName;
		//   - Generic function call: func<int>(args);
		Token peek = lexer_peek_token(&parser->lexer);

		// Simple cases: identifier followed by identifier or star is a declaration
		if (peek.type == TOK_IDENTIFIER || peek.type == TOK_STAR)
		{
			// Likely a declaration: TypeName varName or TypeName* varName
			TypeRef *type = parse_type(parser);
			if (type && parser->current.type == TOK_IDENTIFIER)
			{
				ASTNode *node = ast_new_node(AST_VAR_DECL);
				node->data.var_decl.type = type;
				node->data.var_decl.name = token_to_string(&parser->current);
				node->line = parser->current.line;
				advance(parser);

				while (match(parser, TOK_LBRACKET))
				{
					while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
					{
						advance(parser);
					}
					consume(parser, TOK_RBRACKET, "Expected ']'");
				}

				if (match(parser, TOK_ASSIGN))
				{
					node->data.var_decl.init = parse_expression(parser);
				}

				consume(parser, TOK_SEMICOLON, "Expected ';' after variable declaration");
				return node;
			}
			ast_free_type_ref(type);
		}
		else if (peek.type == TOK_LT)
		{
			// Could be generic type (declaration) or generic function call (expression)
			// Parse the type first, then check what follows
			TypeRef *type = parse_type(parser);
			if (type && parser->current.type == TOK_IDENTIFIER)
			{
				// It's a declaration: GenericType<T> varName
				ASTNode *node = ast_new_node(AST_VAR_DECL);
				node->data.var_decl.type = type;
				node->data.var_decl.name = token_to_string(&parser->current);
				node->line = parser->current.line;
				advance(parser);

				while (match(parser, TOK_LBRACKET))
				{
					while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
					{
						advance(parser);
					}
					consume(parser, TOK_RBRACKET, "Expected ']'");
				}

				if (match(parser, TOK_ASSIGN))
				{
					node->data.var_decl.init = parse_expression(parser);
				}

				consume(parser, TOK_SEMICOLON, "Expected ';' after variable declaration");
				return node;
			}
			// It's a function call - need to reconstruct the expression
			// The type was: name<type_args>
			// Create an identifier node for the callee, then create a call with type args
			if (type && parser->current.type == TOK_LPAREN)
			{
				// This is a generic function call as a statement
				ASTNode *callee = ast_new_node(AST_IDENTIFIER);
				callee->data.ident.name = strdup(type->name);
				callee->line = parser->previous.line;

				// Consume the (
				advance(parser);

				ASTNode *call = ast_new_node(AST_CALL);
				call->data.call.callee = callee;
				call->data.call.type_args = type->type_args;
				type->type_args = NULL; // Transfer ownership
				call->line = parser->previous.line;

				// Parse arguments
				ASTNode *args_head = NULL;
				ASTNode *args_tail = NULL;

				if (!check(parser, TOK_RPAREN))
				{
					do
					{
						ASTNode *arg = parse_assignment(parser);
						if (!arg)
							break;

						if (!args_head)
						{
							args_head = arg;
							args_tail = arg;
						}
						else
						{
							args_tail->next = arg;
							args_tail = arg;
						}
					} while (match(parser, TOK_COMMA));
				}

				consume(parser, TOK_RPAREN, "Expected ')' after arguments");
				call->data.call.args = args_head;

				ast_free_type_ref(type); // Free the type (we extracted what we needed)

				consume(parser, TOK_SEMICOLON, "Expected ';' after function call");
				return call;
			}
			ast_free_type_ref(type);
		}
		// Otherwise fall through to expression parsing
	}

	// Expression statement
	ASTNode *node = ast_new_node(AST_EXPR_STMT);
	node->line = parser->current.line;
	ASTNode *expr = parse_expression(parser);
	if (!expr)
	{
		ast_free(node);
		return NULL;
	}

	// Reuse the expression node
	ast_free(node);
	node = expr;

	consume(parser, TOK_SEMICOLON, "Expected ';' after expression");
	return node;
}

// Parse function definition: type name<T>(...) { ... }
static ASTNode *parse_function(Parser *parser, TypeRef *return_type, char *name)
{
	ASTNode *node = ast_new_node(AST_FUNC_DEF);
	node->data.func_def.return_type = return_type;
	node->data.func_def.name = name;
	node->line = parser->current.line;

	// Optional type parameters
	node->data.func_def.type_params = parse_type_params(parser);

	consume(parser, TOK_LPAREN, "Expected '(' after function name");
	node->data.func_def.params = parse_params(parser);
	consume(parser, TOK_RPAREN, "Expected ')' after parameters");

	// Body or declaration
	if (match(parser, TOK_SEMICOLON))
	{
		node->type = AST_FUNC_DECL;
	}
	else
	{
		node->data.func_def.body = parse_block(parser);
	}

	return node;
}

static ASTNode *parse_declaration(Parser *parser)
{
	// Check for EOF
	if (check(parser, TOK_EOF))
	{
		return NULL;
	}

	// Handle #include directive
	if (match(parser, TOK_HASH))
	{
		if (!match(parser, TOK_INCLUDE))
		{
			error(parser, "Expected 'include' after '#'");
			return NULL;
		}

		ASTNode *node = ast_new_node(AST_INCLUDE);
		node->line = parser->previous.line;

		if (check(parser, TOK_STRING))
		{
			// #include "path"
			node->data.include.is_system = 0;
			// Extract the path without quotes
			char *full = token_to_string(&parser->current);
			size_t len = strlen(full);
			if (len >= 2)
			{
				node->data.include.path = (char *)malloc(len - 1);
				strncpy(node->data.include.path, full + 1, len - 2);
				node->data.include.path[len - 2] = '\0';
			}
			else
			{
				node->data.include.path = strdup("");
			}
			free(full);
			advance(parser);
		}
		else if (match(parser, TOK_LT))
		{
			// #include <path>
			node->data.include.is_system = 1;
			// Collect tokens until >
			size_t cap = 64;
			size_t len = 0;
			char *path = (char *)malloc(cap);
			path[0] = '\0';

			while (!check(parser, TOK_GT) && !check(parser, TOK_EOF))
			{
				char *part = token_to_string(&parser->current);
				size_t plen = strlen(part);
				if (len + plen + 1 >= cap)
				{
					cap *= 2;
					path = (char *)realloc(path, cap);
				}
				strcat(path, part);
				len += plen;
				free(part);
				advance(parser);
			}
			consume(parser, TOK_GT, "Expected '>' after system include path");
			node->data.include.path = path;
		}
		else
		{
			error(parser, "Expected string or '<' after #include");
			return node;
		}

		return node;
	}

	// Struct definition
	if (check(parser, TOK_STRUCT))
	{
		// Peek to see if this is a definition or just a type
		Token next = lexer_peek_token(&parser->lexer);
		if (next.type == TOK_IDENTIFIER)
		{
			// Could be struct definition or variable declaration
			// Save state and try to determine
			advance(parser); // consume struct
			char *name = token_to_string(&parser->current);
			advance(parser); // consume name

			if (check(parser, TOK_LT) || check(parser, TOK_LBRACE))
			{
				// This is a struct definition
				ASTNode *node = ast_new_node(AST_STRUCT_DEF);
				node->data.struct_def.name = name;
				node->line = parser->previous.line;

				// Optional type parameters
				node->data.struct_def.type_params = parse_type_params(parser);

				consume(parser, TOK_LBRACE, "Expected '{' after struct name");

				// Parse members
				ASTNode *members_head = NULL;
				ASTNode *members_tail = NULL;

				while (!check(parser, TOK_RBRACE) && !check(parser, TOK_EOF))
				{
					TypeRef *type = parse_type(parser);
					if (!type)
					{
						error(parser, "Expected type in struct member");
						break;
					}

					if (parser->current.type != TOK_IDENTIFIER)
					{
						error(parser, "Expected member name");
						ast_free_type_ref(type);
						break;
					}

					ASTNode *member = ast_new_node(AST_VAR_DECL);
					member->data.var_decl.type = type;
					member->data.var_decl.name = token_to_string(&parser->current);
					member->line = parser->current.line;
					advance(parser);

					// Handle array declaration
					while (match(parser, TOK_LBRACKET))
					{
						while (!check(parser, TOK_RBRACKET) && !check(parser, TOK_EOF))
						{
							advance(parser);
						}
						consume(parser, TOK_RBRACKET, "Expected ']'");
					}

					consume(parser, TOK_SEMICOLON, "Expected ';' after struct member");

					if (!members_head)
					{
						members_head = member;
						members_tail = member;
					}
					else
					{
						members_tail->next = member;
						members_tail = member;
					}
				}

				consume(parser, TOK_RBRACE, "Expected '}' after struct body");
				consume(parser, TOK_SEMICOLON, "Expected ';' after struct definition");

				node->data.struct_def.members = members_head;
				return node;
			}
			else
			{
				// Check for forward declaration: struct Name;
				if (check(parser, TOK_SEMICOLON))
				{
					// Forward declaration - emit as passthrough
					char *full_name = (char *)malloc(strlen("struct ") + strlen(name) + 1);
					strcpy(full_name, "struct ");
					strcat(full_name, name);

					ASTNode *node = ast_new_node(AST_PASSTHROUGH);
					node->data.passthrough.code = full_name;
					node->line = parser->previous.line;
					free(name);
					consume(parser, TOK_SEMICOLON, "Expected ';'");
					return node;
				}

				// It's a variable or function with struct return type: struct Name varname; OR struct Name funcname()
				char *full_name = (char *)malloc(strlen("struct ") + strlen(name) + 1);
				strcpy(full_name, "struct ");
				strcat(full_name, name);
				free(name);

				TypeRef *type = type_ref_new(full_name);
				free(full_name);

				// Parse pointer stars
				while (match(parser, TOK_STAR))
				{
					type->pointer_level++;
				}

				if (parser->current.type != TOK_IDENTIFIER)
				{
					error(parser, "Expected variable or function name");
					ast_free_type_ref(type);
					return NULL;
				}

				char *var_or_func_name = token_to_string(&parser->current);
				advance(parser);

				// Check if this is a function: struct Name funcname(...)
				if (check(parser, TOK_LPAREN))
				{
					return parse_function(parser, type, var_or_func_name);
				}

				// It's a variable declaration
				ASTNode *node = ast_new_node(AST_VAR_DECL);
				node->data.var_decl.type = type;
				node->data.var_decl.name = var_or_func_name;
				node->line = parser->previous.line;

				consume(parser, TOK_SEMICOLON, "Expected ';'");
				return node;
			}
		}
	}

	// Typedef
	if (match(parser, TOK_TYPEDEF))
	{
		ASTNode *node = ast_new_node(AST_TYPEDEF);
		node->line = parser->previous.line;
		node->data.typedef_stmt.type = parse_type(parser);

		if (parser->current.type != TOK_IDENTIFIER)
		{
			error(parser, "Expected typedef name");
			return node;
		}

		node->data.typedef_stmt.name = token_to_string(&parser->current);
		advance(parser);
		consume(parser, TOK_SEMICOLON, "Expected ';' after typedef");
		return node;
	}

	// Handle static/extern storage class specifiers
	int is_static = match(parser, TOK_STATIC);
	int is_extern = match(parser, TOK_EXTERN);
	(void)is_static;
	(void)is_extern; // TODO: use these later

	// Function or variable
	TypeRef *type = parse_type(parser);
	if (!type)
	{
		error(parser, "Expected type");
		return NULL;
	}

	if (parser->current.type != TOK_IDENTIFIER)
	{
		error(parser, "Expected name after type");
		ast_free_type_ref(type);
		return NULL;
	}

	char *name = token_to_string(&parser->current);
	advance(parser);

	// Check for type parameters or function
	if (check(parser, TOK_LT) || check(parser, TOK_LPAREN))
	{
		return parse_function(parser, type, name);
	}

	// Variable declaration
	ASTNode *node = ast_new_node(AST_VAR_DECL);
	node->data.var_decl.type = type;
	node->data.var_decl.name = name;
	node->line = parser->previous.line;

	// Optional initializer
	if (match(parser, TOK_ASSIGN))
	{
		node->data.var_decl.init = parse_expression(parser);
	}

	consume(parser, TOK_SEMICOLON, "Expected ';' after variable declaration");
	return node;
}

ASTNode *parser_parse(Parser *parser)
{
	ASTNode *program = ast_new_node(AST_PROGRAM);
	ASTNode *decls_head = NULL;
	ASTNode *decls_tail = NULL;

	while (!check(parser, TOK_EOF))
	{
		ASTNode *decl = parse_declaration(parser);
		if (!decl)
		{
			if (parser->panic_mode)
			{
				// Skip to next declaration
				while (!check(parser, TOK_SEMICOLON) && !check(parser, TOK_RBRACE) &&
							 !check(parser, TOK_EOF))
				{
					advance(parser);
				}
				if (check(parser, TOK_SEMICOLON) || check(parser, TOK_RBRACE))
				{
					advance(parser);
				}
				parser->panic_mode = 0;
				continue;
			}
			break;
		}

		if (!decls_head)
		{
			decls_head = decl;
			decls_tail = decl;
		}
		else
		{
			decls_tail->next = decl;
			decls_tail = decl;
		}
	}

	program->data.block.statements = decls_head;
	return program;
}

const char *parser_get_error(Parser *parser)
{
	return parser->error_message;
}
