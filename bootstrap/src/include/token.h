#pragma once
#include <string>
#include <vector>

enum class TokenType
{
	// Keywords
	EXPECT,
	ACTUAL,
	MODULE,
	USE,
	FN,
	LET,
	MUT,
	STRUCT,
	ENUM,
	IF,
	ELSE,
	WHILE,
	LOOP,
	BREAK,
	CONTINUE,
	RETURN,
	TYPE,
	IS,
	TRUE,
	FALSE,

	// Integer Types
	U8,
	U16,
	U32,
	U64,
	I8,
	I16,
	I32,
	I64,
	// Float Types
	F32,
	F64,
	// Other Types
	BOOL,
	VOID,

	// Symbols
	LPAREN,
	RPAREN,
	LBRACE,
	RBRACE,
	LBRACKET,
	RBRACKET,
	LANGLE,
	RANGLE,
	COLON,
	DOUBLE_COLON,
	SEMICOLON,
	COMMA,
	DOT,
	ARROW,
	FAT_ARROW,

	// Comparison Operators
	LESS,
	GREATER,
	LESS_EQUAL,
	GREATER_EQUAL,
	EQUAL_EQUAL,
	NOT_EQUAL,
	// Logical Operators
	AND_AND,
	OR_OR,
	NOT,
	// Bitwise Operators
	AMPERSAND,
	PIPE,
	CARET,
	TILDE,
	LEFT_SHIFT,
	RIGHT_SHIFT,
	// Arithmetic Operators
	PLUS,
	MINUS,
	STAR,
	SLASH,
	PERCENT,
	// Assignment
	EQUALS,

	// Literals
	INT_LITERAL,
	FLOAT_LITERAL,
	STRING_LITERAL,
	IDENTIFIER,

	END_OF_FILE
};

struct Token
{
	TokenType type;
	std::string value;
	int line;
	int column;
};
