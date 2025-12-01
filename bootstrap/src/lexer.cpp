#include "lexer.h"
#include <cctype>
#include <unordered_map>
#include <iostream>

Lexer::Lexer(const std::string &src) : source(src) {}

char Lexer::peek(int offset) const
{
	if (pos + offset >= source.length())
		return '\0';
	return source[pos + offset];
}

char Lexer::advance()
{
	if (pos >= source.length())
		return '\0';
	char c = source[pos++];
	if (c == '\n')
	{
		line++;
		column = 1;
	}
	else
	{
		column++;
	}
	return c;
}

bool Lexer::match(char expected)
{
	if (peek() == expected)
	{
		advance();
		return true;
	}
	return false;
}

void Lexer::skipWhitespace()
{
	while (true)
	{
		char c = peek();
		if (isspace(c))
		{
			advance();
		}
		else if (c == '/' && peek(1) == '/')
		{
			// Single line comment
			while (peek() != '\n' && peek() != '\0')
				advance();
		}
		else if (c == '/' && peek(1) == '*')
		{
			// Multi line comment
			advance();
			advance();
			while (!(peek() == '*' && peek(1) == '/') && peek() != '\0')
				advance();
			if (peek() != '\0')
			{
				advance();
				advance();
			}
		}
		else
		{
			break;
		}
	}
}

Token Lexer::identifierOrKeyword()
{
	int startCol = column;
	std::string text;
	while (isalnum(peek()) || peek() == '_')
	{
		text += advance();
	}

	static const std::unordered_map<std::string, TokenType> keywords = {
			{"expect", TokenType::EXPECT},
			{"actual", TokenType::ACTUAL},
			{"module", TokenType::MODULE},
			{"use", TokenType::USE},
			{"fn", TokenType::FN},
			{"let", TokenType::LET},
			{"mut", TokenType::MUT},
			{"struct", TokenType::STRUCT},
			{"enum", TokenType::ENUM},
			{"if", TokenType::IF},
			{"else", TokenType::ELSE},
			{"while", TokenType::WHILE},
			{"loop", TokenType::LOOP},
			{"break", TokenType::BREAK},
			{"continue", TokenType::CONTINUE},
			{"return", TokenType::RETURN},
			{"type", TokenType::TYPE},
			{"is", TokenType::IS},
			{"sizeOf", TokenType::SIZEOF},
			{"true", TokenType::TRUE},
			{"false", TokenType::FALSE},
			{"I32", TokenType::I32},
			{"Bool", TokenType::BOOL},
			{"Void", TokenType::VOID},
			{"USize", TokenType::USIZE},
			// Add other types as needed
	};

	auto it = keywords.find(text);
	TokenType type = (it != keywords.end()) ? it->second : TokenType::IDENTIFIER;
	return {type, text, line, startCol};
}

Token Lexer::stringLiteral()
{
	int startLine = line;
	int startCol = column;
	advance(); // consume opening "

	std::string text;
	while (peek() != '"' && peek() != '\0')
	{
		if (peek() == '\\')
		{
			advance(); // consume backslash
			char escaped = advance();
			switch (escaped)
			{
			case 'n':
				text += '\n';
				break;
			case 't':
				text += '\t';
				break;
			case 'r':
				text += '\r';
				break;
			case '\\':
				text += '\\';
				break;
			case '"':
				text += '"';
				break;
			default:
				// Unknown escape - just include the character
				text += escaped;
				break;
			}
		}
		else
		{
			text += advance();
		}
	}

	if (peek() != '"')
	{
		std::cerr << "Lexer Error: Unterminated string at line " << startLine << std::endl;
		exit(1);
	}

	advance(); // consume closing "
	return {TokenType::STRING_LITERAL, text, startLine, startCol};
}

Token Lexer::number()
{
	int startCol = column;
	std::string text;
	while (isdigit(peek()))
	{
		text += advance();
	}
	// TODO: Handle floats
	return {TokenType::INT_LITERAL, text, line, startCol};
}

std::vector<Token> Lexer::tokenize()
{
	std::vector<Token> tokens;
	while (peek() != '\0')
	{
		skipWhitespace();
		if (peek() == '\0')
			break;

		int startLine = line;
		int startCol = column;
		char c = peek();

		if (isalpha(c) || c == '_')
		{
			tokens.push_back(identifierOrKeyword());
		}
		else if (isdigit(c))
		{
			tokens.push_back(number());
		}
		else if (c == '"')
		{
			tokens.push_back(stringLiteral());
		}
		else
		{
			advance();
			switch (c)
			{
			case '(':
				tokens.push_back({TokenType::LPAREN, "(", startLine, startCol});
				break;
			case ')':
				tokens.push_back({TokenType::RPAREN, ")", startLine, startCol});
				break;
			case '{':
				tokens.push_back({TokenType::LBRACE, "{", startLine, startCol});
				break;
			case '}':
				tokens.push_back({TokenType::RBRACE, "}", startLine, startCol});
				break;
			case '[':
				tokens.push_back({TokenType::LBRACKET, "[", startLine, startCol});
				break;
			case ']':
				tokens.push_back({TokenType::RBRACKET, "]", startLine, startCol});
				break;
			case ':':
				if (match(':'))
					tokens.push_back({TokenType::DOUBLE_COLON, "::", startLine, startCol});
				else
					tokens.push_back({TokenType::COLON, ":", startLine, startCol});
				break;
			case ';':
				tokens.push_back({TokenType::SEMICOLON, ";", startLine, startCol});
				break;
			case ',':
				tokens.push_back({TokenType::COMMA, ",", startLine, startCol});
				break;
			case '.':
				tokens.push_back({TokenType::DOT, ".", startLine, startCol});
				break;
			case '=':
				if (match('='))
					tokens.push_back({TokenType::EQUAL_EQUAL, "==", startLine, startCol});
				else if (match('>'))
					tokens.push_back({TokenType::FAT_ARROW, "=>", startLine, startCol});
				else
					tokens.push_back({TokenType::EQUALS, "=", startLine, startCol});
				break;
			case '+':
				tokens.push_back({TokenType::PLUS, "+", startLine, startCol});
				break;
			case '-':
				if (match('>'))
					tokens.push_back({TokenType::ARROW, "->", startLine, startCol});
				else
					tokens.push_back({TokenType::MINUS, "-", startLine, startCol});
				break;
			case '*':
				tokens.push_back({TokenType::STAR, "*", startLine, startCol});
				break;
			case '/':
				tokens.push_back({TokenType::SLASH, "/", startLine, startCol});
				break;
			case '%':
				tokens.push_back({TokenType::PERCENT, "%", startLine, startCol});
				break;
			case '<':
				if (match('='))
					tokens.push_back({TokenType::LESS_EQUAL, "<=", startLine, startCol});
				else if (match('<'))
					tokens.push_back({TokenType::LEFT_SHIFT, "<<", startLine, startCol});
				else
					tokens.push_back({TokenType::LESS, "<", startLine, startCol});
				break;
			case '>':
				if (match('='))
					tokens.push_back({TokenType::GREATER_EQUAL, ">=", startLine, startCol});
				else if (match('>'))
					tokens.push_back({TokenType::RIGHT_SHIFT, ">>", startLine, startCol});
				else
					tokens.push_back({TokenType::GREATER, ">", startLine, startCol});
				break;
			case '&':
				if (match('&'))
					tokens.push_back({TokenType::AND_AND, "&&", startLine, startCol});
				else
					tokens.push_back({TokenType::AMPERSAND, "&", startLine, startCol});
				break;
			case '|':
				if (match('|'))
					tokens.push_back({TokenType::OR_OR, "||", startLine, startCol});
				else
					tokens.push_back({TokenType::PIPE, "|", startLine, startCol});
				break;
			case '!':
				if (match('='))
					tokens.push_back({TokenType::NOT_EQUAL, "!=", startLine, startCol});
				else
					tokens.push_back({TokenType::NOT, "!", startLine, startCol});
				break;
			case '^':
				tokens.push_back({TokenType::CARET, "^", startLine, startCol});
				break;
			case '~':
				tokens.push_back({TokenType::TILDE, "~", startLine, startCol});
				break;
			// Add other operators
			default:
				// Unknown char, skip for now or error
				break;
			}
		}
	}
	tokens.push_back({TokenType::END_OF_FILE, "", line, column});
	return tokens;
}
