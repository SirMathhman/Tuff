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
	bool pendingGreater = false; // For handling >> in nested generics

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
	std::shared_ptr<ASTNode> parseExternFnDecl();
	std::shared_ptr<ASTNode> parseExternTypeDecl();
	std::shared_ptr<ASTNode> parseExternUseDecl();
	std::shared_ptr<ASTNode> parseStructDecl();
	std::shared_ptr<ASTNode> parseEnumDecl();
	std::shared_ptr<ASTNode> parseTypeAlias();
	std::shared_ptr<ASTNode> parseImplBlock();
	std::shared_ptr<ASTNode> parseLetStatement();
	std::shared_ptr<ASTNode> parseInLetStatement();
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
	std::shared_ptr<ASTNode> parseBitwiseAnd();
	std::shared_ptr<ASTNode> parseMultiplicative();
	std::shared_ptr<ASTNode> parseUnary();
	std::shared_ptr<ASTNode> parsePostfix();
	std::shared_ptr<ASTNode> parsePrimary();
	std::shared_ptr<ASTNode> parseMatchExpr();

	std::vector<std::shared_ptr<ASTNode>> parseGenericParams();
	std::shared_ptr<ASTNode> parseType();
	std::shared_ptr<ASTNode> parseIntersectionType();
	std::shared_ptr<ASTNode> parseSingleType();
	std::vector<std::shared_ptr<ASTNode>> parseGenericArgs();
	bool isGenericInstantiation();
	bool isLifetimeParam(const std::string &name) const;
	std::string typeToString(std::shared_ptr<ASTNode> node); // Helper to convert type AST back to string

public:
	Parser(const std::vector<Token> &toks);
	std::shared_ptr<ASTNode> parse();
};
