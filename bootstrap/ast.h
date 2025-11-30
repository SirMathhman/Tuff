#pragma once
#include <string>
#include <vector>
#include <memory>
#include "token.h"

enum class ASTNodeType
{
	PROGRAM,
	FUNCTION_DECL,
	LET_STMT,
	ASSIGNMENT_STMT, // For x = 10;
	IF_EXPR,
	WHILE_STMT,
	RETURN_STMT,
	BLOCK,
	CALL_EXPR,
	BINARY_OP,
	UNARY_OP,
	LITERAL,
	IDENTIFIER,
	TYPE
};

struct ASTNode
{
	ASTNodeType type;
	std::string value; // For identifiers, literals, operators
	std::vector<std::shared_ptr<ASTNode>> children;

	// Type information (filled by TypeChecker)
	std::string inferredType;
	bool isMutable = false; // For LET_STMT

	// Helper to add a child
	void addChild(std::shared_ptr<ASTNode> child)
	{
		children.push_back(child);
	}
};
