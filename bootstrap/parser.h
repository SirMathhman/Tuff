#pragma once
#include <vector>
#include <memory>
#include "token.h"
#include "ast.h"

class Parser
{
private:
	std::vector<Token> tokens;
	size_t pos = 0;

	Token peek(int offset = 0) const;
	Token advance();
	bool match(TokenType type);
	Token consume(TokenType type, const std::string &errorMsg);

	std::shared_ptr<ASTNode> parseStatement();
	std::shared_ptr<ASTNode> parseLetStatement();
    std::shared_ptr<ASTNode> parseAssignmentStatement();
    std::shared_ptr<ASTNode> parseExpression();
    std::shared_ptr<ASTNode> parseLogicalOr();
    std::shared_ptr<ASTNode> parseLogicalAnd();
    std::shared_ptr<ASTNode> parseEquality();
    std::shared_ptr<ASTNode> parseComparison();
    std::shared_ptr<ASTNode> parseAdditive();
    std::shared_ptr<ASTNode> parseMultiplicative();
    std::shared_ptr<ASTNode> parseUnary();    std::shared_ptr<ASTNode> parsePrimary();public:
	Parser(const std::vector<Token> &toks);
	std::shared_ptr<ASTNode> parse();
};
