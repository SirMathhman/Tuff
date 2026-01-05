#include "lexer.h"
#include <string.h>
#include <ctype.h>
#include <stdio.h>

void lexer_init(Lexer *lexer, const char *source)
{
	lexer->source = source;
	lexer->current = source;
	lexer->start = source;
	lexer->line = 1;
	lexer->column = 1;
}

static int is_at_end(Lexer *lexer)
{
	return *lexer->current == '\0';
}

static char advance(Lexer *lexer)
{
	char c = *lexer->current++;
	if (c == '\n')
	{
		lexer->line++;
		lexer->column = 1;
	}
	else
	{
		lexer->column++;
	}
	return c;
}

static char peek(Lexer *lexer)
{
	return *lexer->current;
}

static char peek_next(Lexer *lexer)
{
	if (is_at_end(lexer))
		return '\0';
	return lexer->current[1];
}

static int match(Lexer *lexer, char expected)
{
	if (is_at_end(lexer))
		return 0;
	if (*lexer->current != expected)
		return 0;
	advance(lexer);
	return 1;
}

static void skip_whitespace(Lexer *lexer)
{
	for (;;)
	{
		char c = peek(lexer);
		switch (c)
		{
		case ' ':
		case '\t':
		case '\r':
		case '\n':
			advance(lexer);
			break;
		case '/':
			if (peek_next(lexer) == '/')
			{
				// Single-line comment
				while (peek(lexer) != '\n' && !is_at_end(lexer))
				{
					advance(lexer);
				}
			}
			else if (peek_next(lexer) == '*')
			{
				// Multi-line comment
				advance(lexer); // consume /
				advance(lexer); // consume *
				while (!is_at_end(lexer))
				{
					if (peek(lexer) == '*' && peek_next(lexer) == '/')
					{
						advance(lexer);
						advance(lexer);
						break;
					}
					advance(lexer);
				}
			}
			else
			{
				return;
			}
			break;
		default:
			return;
		}
	}
}

static Token make_token(Lexer *lexer, TokenType type)
{
	Token token;
	token.type = type;
	token.start = lexer->start;
	token.length = (size_t)(lexer->current - lexer->start);
	token.line = lexer->line;
	token.column = lexer->column - (int)token.length;
	return token;
}

static Token error_token(Lexer *lexer, const char *message)
{
	Token token;
	token.type = TOK_ERROR;
	token.start = message;
	token.length = strlen(message);
	token.line = lexer->line;
	token.column = lexer->column;
	return token;
}

static TokenType check_keyword(const char *start, size_t length, const char *rest, TokenType type)
{
	size_t rest_len = strlen(rest);
	if (length == rest_len && memcmp(start, rest, length) == 0)
	{
		return type;
	}
	return TOK_IDENTIFIER;
}

static TokenType identifier_type(Lexer *lexer)
{
	size_t length = (size_t)(lexer->current - lexer->start);
	const char *start = lexer->start;

	// Check keywords
	switch (start[0])
	{
	case 'b':
		if (check_keyword(start, length, "break", TOK_BREAK) != TOK_IDENTIFIER)
			return TOK_BREAK;
		break;
	case 'c':
		if (check_keyword(start, length, "case", TOK_CASE) != TOK_IDENTIFIER)
			return TOK_CASE;
		if (check_keyword(start, length, "char", TOK_CHAR) != TOK_IDENTIFIER)
			return TOK_CHAR;
		if (check_keyword(start, length, "const", TOK_CONST) != TOK_IDENTIFIER)
			return TOK_CONST;
		if (check_keyword(start, length, "continue", TOK_CONTINUE) != TOK_IDENTIFIER)
			return TOK_CONTINUE;
		break;
	case 'd':
		if (check_keyword(start, length, "default", TOK_DEFAULT) != TOK_IDENTIFIER)
			return TOK_DEFAULT;
		if (check_keyword(start, length, "do", TOK_DO) != TOK_IDENTIFIER)
			return TOK_DO;
		if (check_keyword(start, length, "double", TOK_DOUBLE) != TOK_IDENTIFIER)
			return TOK_DOUBLE;
		break;
	case 'e':
		if (check_keyword(start, length, "else", TOK_ELSE) != TOK_IDENTIFIER)
			return TOK_ELSE;
		if (check_keyword(start, length, "enum", TOK_ENUM) != TOK_IDENTIFIER)
			return TOK_ENUM;
		if (check_keyword(start, length, "extern", TOK_EXTERN) != TOK_IDENTIFIER)
			return TOK_EXTERN;
		break;
	case 'f':
		if (check_keyword(start, length, "float", TOK_FLOAT) != TOK_IDENTIFIER)
			return TOK_FLOAT;
		if (check_keyword(start, length, "for", TOK_FOR) != TOK_IDENTIFIER)
			return TOK_FOR;
		break;
	case 'i':
		if (check_keyword(start, length, "if", TOK_IF) != TOK_IDENTIFIER)
			return TOK_IF;
		if (check_keyword(start, length, "int", TOK_INT) != TOK_IDENTIFIER)
			return TOK_INT;
		break;
	case 'l':
		if (check_keyword(start, length, "long", TOK_LONG) != TOK_IDENTIFIER)
			return TOK_LONG;
		break;
	case 'r':
		if (check_keyword(start, length, "return", TOK_RETURN) != TOK_IDENTIFIER)
			return TOK_RETURN;
		break;
	case 's':
		if (check_keyword(start, length, "short", TOK_SHORT) != TOK_IDENTIFIER)
			return TOK_SHORT;
		if (check_keyword(start, length, "signed", TOK_SIGNED) != TOK_IDENTIFIER)
			return TOK_SIGNED;
		if (check_keyword(start, length, "sizeof", TOK_SIZEOF) != TOK_IDENTIFIER)
			return TOK_SIZEOF;
		if (check_keyword(start, length, "static", TOK_STATIC) != TOK_IDENTIFIER)
			return TOK_STATIC;
		if (check_keyword(start, length, "struct", TOK_STRUCT) != TOK_IDENTIFIER)
			return TOK_STRUCT;
		if (check_keyword(start, length, "switch", TOK_SWITCH) != TOK_IDENTIFIER)
			return TOK_SWITCH;
		break;
	case 't':
		if (check_keyword(start, length, "typedef", TOK_TYPEDEF) != TOK_IDENTIFIER)
			return TOK_TYPEDEF;
		break;
	case 'u':
		if (check_keyword(start, length, "union", TOK_UNION) != TOK_IDENTIFIER)
			return TOK_UNION;
		if (check_keyword(start, length, "unsigned", TOK_UNSIGNED) != TOK_IDENTIFIER)
			return TOK_UNSIGNED;
		break;
	case 'v':
		if (check_keyword(start, length, "void", TOK_VOID) != TOK_IDENTIFIER)
			return TOK_VOID;
		break;
	case 'w':
		if (check_keyword(start, length, "while", TOK_WHILE) != TOK_IDENTIFIER)
			return TOK_WHILE;
		break;
	}

	return TOK_IDENTIFIER;
}

static Token identifier(Lexer *lexer)
{
	while (isalnum(peek(lexer)) || peek(lexer) == '_')
	{
		advance(lexer);
	}
	return make_token(lexer, identifier_type(lexer));
}

static Token number(Lexer *lexer)
{
	while (isdigit(peek(lexer)))
	{
		advance(lexer);
	}

	// Decimal point
	if (peek(lexer) == '.' && isdigit(peek_next(lexer)))
	{
		advance(lexer); // consume .
		while (isdigit(peek(lexer)))
		{
			advance(lexer);
		}
	}

	// Exponent
	if (peek(lexer) == 'e' || peek(lexer) == 'E')
	{
		advance(lexer);
		if (peek(lexer) == '+' || peek(lexer) == '-')
		{
			advance(lexer);
		}
		while (isdigit(peek(lexer)))
		{
			advance(lexer);
		}
	}

	// Suffix (f, l, u, etc.)
	while (isalpha(peek(lexer)))
	{
		advance(lexer);
	}

	return make_token(lexer, TOK_NUMBER);
}

static Token string(Lexer *lexer)
{
	while (peek(lexer) != '"' && !is_at_end(lexer))
	{
		if (peek(lexer) == '\\' && peek_next(lexer) != '\0')
		{
			advance(lexer); // consume backslash
		}
		advance(lexer);
	}

	if (is_at_end(lexer))
	{
		return error_token(lexer, "Unterminated string");
	}

	advance(lexer); // closing quote
	return make_token(lexer, TOK_STRING);
}

static Token character(Lexer *lexer)
{
	if (peek(lexer) == '\\')
	{
		advance(lexer); // consume backslash
	}
	if (!is_at_end(lexer))
	{
		advance(lexer); // consume character
	}

	if (peek(lexer) != '\'')
	{
		return error_token(lexer, "Unterminated character literal");
	}

	advance(lexer); // closing quote
	return make_token(lexer, TOK_CHAR_LITERAL);
}

Token lexer_next_token(Lexer *lexer)
{
	skip_whitespace(lexer);

	lexer->start = lexer->current;

	if (is_at_end(lexer))
	{
		return make_token(lexer, TOK_EOF);
	}

	char c = advance(lexer);

	if (isalpha(c) || c == '_')
	{
		return identifier(lexer);
	}

	if (isdigit(c))
	{
		return number(lexer);
	}

	switch (c)
	{
	case '{':
		return make_token(lexer, TOK_LBRACE);
	case '}':
		return make_token(lexer, TOK_RBRACE);
	case '(':
		return make_token(lexer, TOK_LPAREN);
	case ')':
		return make_token(lexer, TOK_RPAREN);
	case '[':
		return make_token(lexer, TOK_LBRACKET);
	case ']':
		return make_token(lexer, TOK_RBRACKET);
	case '<':
		if (match(lexer, '<'))
			return make_token(lexer, TOK_LSHIFT);
		if (match(lexer, '='))
			return make_token(lexer, TOK_LE);
		return make_token(lexer, TOK_LT);
	case '>':
		if (match(lexer, '>'))
			return make_token(lexer, TOK_RSHIFT);
		if (match(lexer, '='))
			return make_token(lexer, TOK_GE);
		return make_token(lexer, TOK_GT);
	case ';':
		return make_token(lexer, TOK_SEMICOLON);
	case ',':
		return make_token(lexer, TOK_COMMA);
	case '.':
		return make_token(lexer, TOK_DOT);
	case '?':
		return make_token(lexer, TOK_QUESTION);
	case ':':
		return make_token(lexer, TOK_COLON);
	case '~':
		return make_token(lexer, TOK_TILDE);
	case '+':
		if (match(lexer, '+'))
			return make_token(lexer, TOK_INC);
		if (match(lexer, '='))
			return make_token(lexer, TOK_PLUS_ASSIGN);
		return make_token(lexer, TOK_PLUS);
	case '-':
		if (match(lexer, '-'))
			return make_token(lexer, TOK_DEC);
		if (match(lexer, '='))
			return make_token(lexer, TOK_MINUS_ASSIGN);
		if (match(lexer, '>'))
			return make_token(lexer, TOK_ARROW);
		return make_token(lexer, TOK_MINUS);
	case '*':
		if (match(lexer, '='))
			return make_token(lexer, TOK_STAR_ASSIGN);
		return make_token(lexer, TOK_STAR);
	case '/':
		if (match(lexer, '='))
			return make_token(lexer, TOK_SLASH_ASSIGN);
		return make_token(lexer, TOK_SLASH);
	case '%':
		return make_token(lexer, TOK_PERCENT);
	case '&':
		if (match(lexer, '&'))
			return make_token(lexer, TOK_AND);
		return make_token(lexer, TOK_AMPERSAND);
	case '|':
		if (match(lexer, '|'))
			return make_token(lexer, TOK_OR);
		return make_token(lexer, TOK_PIPE);
	case '^':
		return make_token(lexer, TOK_CARET);
	case '!':
		if (match(lexer, '='))
			return make_token(lexer, TOK_NE);
		return make_token(lexer, TOK_EXCLAIM);
	case '=':
		if (match(lexer, '='))
			return make_token(lexer, TOK_EQ);
		return make_token(lexer, TOK_ASSIGN);
	case '"':
		return string(lexer);
	case '\'':
		return character(lexer);
	}

	return error_token(lexer, "Unexpected character");
}

Token lexer_peek_token(Lexer *lexer)
{
	// Save state
	const char *current = lexer->current;
	const char *start = lexer->start;
	int line = lexer->line;
	int column = lexer->column;

	Token token = lexer_next_token(lexer);

	// Restore state
	lexer->current = current;
	lexer->start = start;
	lexer->line = line;
	lexer->column = column;

	return token;
}

const char *token_type_name(TokenType type)
{
	switch (type)
	{
	case TOK_STRUCT:
		return "struct";
	case TOK_VOID:
		return "void";
	case TOK_INT:
		return "int";
	case TOK_CHAR:
		return "char";
	case TOK_FLOAT:
		return "float";
	case TOK_DOUBLE:
		return "double";
	case TOK_LONG:
		return "long";
	case TOK_SHORT:
		return "short";
	case TOK_UNSIGNED:
		return "unsigned";
	case TOK_SIGNED:
		return "signed";
	case TOK_CONST:
		return "const";
	case TOK_STATIC:
		return "static";
	case TOK_EXTERN:
		return "extern";
	case TOK_TYPEDEF:
		return "typedef";
	case TOK_RETURN:
		return "return";
	case TOK_IF:
		return "if";
	case TOK_ELSE:
		return "else";
	case TOK_WHILE:
		return "while";
	case TOK_FOR:
		return "for";
	case TOK_DO:
		return "do";
	case TOK_SWITCH:
		return "switch";
	case TOK_CASE:
		return "case";
	case TOK_DEFAULT:
		return "default";
	case TOK_BREAK:
		return "break";
	case TOK_CONTINUE:
		return "continue";
	case TOK_SIZEOF:
		return "sizeof";
	case TOK_ENUM:
		return "enum";
	case TOK_UNION:
		return "union";
	case TOK_IDENTIFIER:
		return "identifier";
	case TOK_NUMBER:
		return "number";
	case TOK_STRING:
		return "string";
	case TOK_CHAR_LITERAL:
		return "char_literal";
	case TOK_LBRACE:
		return "{";
	case TOK_RBRACE:
		return "}";
	case TOK_LPAREN:
		return "(";
	case TOK_RPAREN:
		return ")";
	case TOK_LBRACKET:
		return "[";
	case TOK_RBRACKET:
		return "]";
	case TOK_LT:
		return "<";
	case TOK_GT:
		return ">";
	case TOK_SEMICOLON:
		return ";";
	case TOK_COMMA:
		return ",";
	case TOK_DOT:
		return ".";
	case TOK_ARROW:
		return "->";
	case TOK_ASSIGN:
		return "=";
	case TOK_PLUS:
		return "+";
	case TOK_MINUS:
		return "-";
	case TOK_STAR:
		return "*";
	case TOK_SLASH:
		return "/";
	case TOK_PERCENT:
		return "%";
	case TOK_AMPERSAND:
		return "&";
	case TOK_PIPE:
		return "|";
	case TOK_CARET:
		return "^";
	case TOK_TILDE:
		return "~";
	case TOK_EXCLAIM:
		return "!";
	case TOK_QUESTION:
		return "?";
	case TOK_COLON:
		return ":";
	case TOK_EQ:
		return "==";
	case TOK_NE:
		return "!=";
	case TOK_LE:
		return "<=";
	case TOK_GE:
		return ">=";
	case TOK_AND:
		return "&&";
	case TOK_OR:
		return "||";
	case TOK_LSHIFT:
		return "<<";
	case TOK_RSHIFT:
		return ">>";
	case TOK_PLUS_ASSIGN:
		return "+=";
	case TOK_MINUS_ASSIGN:
		return "-=";
	case TOK_STAR_ASSIGN:
		return "*=";
	case TOK_SLASH_ASSIGN:
		return "/=";
	case TOK_INC:
		return "++";
	case TOK_DEC:
		return "--";
	case TOK_EOF:
		return "EOF";
	case TOK_ERROR:
		return "error";
	default:
		return "unknown";
	}
}
