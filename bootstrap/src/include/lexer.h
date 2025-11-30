#pragma once
#include <string>
#include <vector>
#include "token.h"

class Lexer
{
private:
	std::string source;
	size_t pos = 0;
	int line = 1;
	int column = 1;

	char peek(int offset = 0) const;
	char advance();
	bool match(char expected);
	void skipWhitespace();
	Token identifierOrKeyword();
	Token number();
	Token stringLiteral(); // Keeping for future use, though not in current scope

public:
	Lexer(const std::string &src);
	std::vector<Token> tokenize();
};
