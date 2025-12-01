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
	void error(const std::string &errorMsg, const std::string &syntaxHint = "");

	std::shared_ptr<ASTNode> parseStatement();
	std::shared_ptr<ASTNode> parseFunctionDecl();
	std::shared_ptr<ASTNode> parseModuleDecl();
	std::shared_ptr<ASTNode> parseUseDecl();
	std::shared_ptr<ASTNode> parseExpectDecl();
	std::shared_ptr<ASTNode> parseActualDecl();
	std::shared_ptr<ASTNode> parseStructDecl();
	std::shared_ptr<ASTNode> parseEnumDecl();
	std::shared_ptr<ASTNode> parseTypeAlias();
	std::shared_ptr<ASTNode> parseLetStatement();
	std::shared_ptr<ASTNode> parseAssignmentStatement();
	bool isAssignmentStatement(); // Lookahead to check for assignment
	std::shared_ptr<ASTNode> parseIfStatement();
	std::shared_ptr<ASTNode> parseWhileStatement();
	std::shared_ptr<ASTNode> parseLoopStatement();
	std::shared_ptr<ASTNode> parseBlock();
	std::shared_ptr<ASTNode> parseStatementOrBlock();
	std::shared_ptr<ASTNode> parseExpression();
	std::shared_ptr<ASTNode> parseLogicalOr();
	std::shared_ptr<ASTNode> parseLogicalAnd();
	std::shared_ptr<ASTNode> parseEquality();
	std::shared_ptr<ASTNode> parseIsCheck();
	std::shared_ptr<ASTNode> parseComparison();
	std::shared_ptr<ASTNode> parseAdditive();
	std::shared_ptr<ASTNode> parseIntersection();
	std::shared_ptr<ASTNode> parseMultiplicative();
	std::shared_ptr<ASTNode> parseUnary();
	std::shared_ptr<ASTNode> parsePostfix();
	std::shared_ptr<ASTNode> parsePrimary();

	std::vector<std::shared_ptr<ASTNode>> parseGenericParams();
	std::string parseType();
	std::string parseIntersectionType();
	std::string parseSingleType();
	std::vector<std::string> parseGenericArgs();
	bool isGenericInstantiation();

public:
	Parser(const std::vector<Token> &toks);
	std::shared_ptr<ASTNode> parse();
};
