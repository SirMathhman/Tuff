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
	IF_STMT,				 // Statement form: if (cond) stmt else stmt
	IF_EXPR,				 // Expression form: if (cond) expr else expr
	WHILE_STMT,
	LOOP_STMT, // Infinite loop: loop { ... }
	BREAK_STMT,
	CONTINUE_STMT,
	RETURN_STMT,
	BLOCK,					// { stmt; stmt; }
	STRUCT_DECL,		// struct Name { field: Type, ... }
	STRUCT_LITERAL, // TypeName { expr, expr, ... }
	ENUM_DECL,			// enum Name { Variant1, Variant2 }
	ENUM_VALUE,			// EnumName.Variant
	FIELD_ACCESS,		// obj.field
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
