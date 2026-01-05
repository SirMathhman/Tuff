#ifndef SAFEC_LEXER_H
#define SAFEC_LEXER_H

#include <stddef.h>

typedef enum
{
	// Keywords
	TOK_STRUCT,
	TOK_VOID,
	TOK_INT,
	TOK_CHAR,
	TOK_FLOAT,
	TOK_DOUBLE,
	TOK_LONG,
	TOK_SHORT,
	TOK_UNSIGNED,
	TOK_SIGNED,
	TOK_CONST,
	TOK_STATIC,
	TOK_EXTERN,
	TOK_TYPEDEF,
	TOK_RETURN,
	TOK_IF,
	TOK_ELSE,
	TOK_WHILE,
	TOK_FOR,
	TOK_DO,
	TOK_SWITCH,
	TOK_CASE,
	TOK_DEFAULT,
	TOK_BREAK,
	TOK_CONTINUE,
	TOK_SIZEOF,
	TOK_ENUM,
	TOK_UNION,

	// Identifiers and literals
	TOK_IDENTIFIER,
	TOK_NUMBER,
	TOK_STRING,
	TOK_CHAR_LITERAL,

	// Operators and punctuation
	TOK_LBRACE,				// {
	TOK_RBRACE,				// }
	TOK_LPAREN,				// (
	TOK_RPAREN,				// )
	TOK_LBRACKET,			// [
	TOK_RBRACKET,			// ]
	TOK_LT,						// <
	TOK_GT,						// >
	TOK_SEMICOLON,		// ;
	TOK_COMMA,				// ,
	TOK_DOT,					// .
	TOK_ARROW,				// ->
	TOK_ASSIGN,				// =
	TOK_PLUS,					// +
	TOK_MINUS,				// -
	TOK_STAR,					// *
	TOK_SLASH,				// /
	TOK_PERCENT,			// %
	TOK_AMPERSAND,		// &
	TOK_PIPE,					// |
	TOK_CARET,				// ^
	TOK_TILDE,				// ~
	TOK_EXCLAIM,			// !
	TOK_QUESTION,			// ?
	TOK_COLON,				// :
	TOK_EQ,						// ==
	TOK_NE,						// !=
	TOK_LE,						// <=
	TOK_GE,						// >=
	TOK_AND,					// &&
	TOK_OR,						// ||
	TOK_LSHIFT,				// <<
	TOK_RSHIFT,				// >>
	TOK_PLUS_ASSIGN,	// +=
	TOK_MINUS_ASSIGN, // -=
	TOK_STAR_ASSIGN,	// *=
	TOK_SLASH_ASSIGN, // /=
	TOK_INC,					// ++
	TOK_DEC,					// --

	// Special
	TOK_EOF,
	TOK_ERROR
} TokenType;

typedef struct
{
	TokenType type;
	const char *start;
	size_t length;
	int line;
	int column;
} Token;

typedef struct
{
	const char *source;
	const char *current;
	const char *start;
	int line;
	int column;
} Lexer;

void lexer_init(Lexer *lexer, const char *source);
Token lexer_next_token(Lexer *lexer);
Token lexer_peek_token(Lexer *lexer);
const char *token_type_name(TokenType type);

#endif // SAFEC_LEXER_H
