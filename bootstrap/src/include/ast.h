#pragma once
#include <string>
#include <vector>
#include <memory>
#include "token.h"
#include "expr.h"
#include "type_env.h"

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
	BLOCK,						// { stmt; stmt; }
	STRUCT_DECL,			// struct Name { field: Type, ... }
	STRUCT_LITERAL,		// TypeName { expr, expr, ... }
	ENUM_DECL,				// enum Name { Variant1, Variant2 }
	ENUM_VALUE,				// EnumName.Variant
	EXPECT_DECL,			// expect fn name(...): Type;
	ACTUAL_DECL,			// actual fn name(...): Type => {...}
	EXTERN_FN_DECL,		// extern fn name(...): Type;
	EXTERN_TYPE_DECL, // type extern TypeName;
	MODULE_DECL,			// module name { statements }
	USE_DECL,					// use module::path;
	USE_EXTERN_DECL,	// use extern stdlib;
	TYPE_ALIAS,				// type Name = Type; or type Name<T> = Type;
	FIELD_ACCESS,			// obj.field
	CALL_EXPR,
	BINARY_OP,
	UNARY_OP,
	LITERAL,
	IDENTIFIER,
	TYPE,
	TYPE_PARAM_DECL, // <T>
	// Pointer and array types
	POINTER_TYPE,		// *T or *mut T
	ARRAY_TYPE,			// [T; init; capacity]
	REFERENCE_EXPR, // &x or &mut x
	DEREF_EXPR,			// *p
	ARRAY_LITERAL,	// [1, 2, 3]
	INDEX_EXPR,			// arr[i]
	IS_EXPR,				// expr is Type
	MATCH_EXPR,			// match expr { Type => expr, ... }
	LIFETIME_PARAM, // lifetime parameter declaration
	SIZEOF_EXPR			// sizeOf(Type) operator
};

struct ASTNode
{
	ASTNodeType type;
	std::string value; // For identifiers, literals, operators
	std::vector<std::shared_ptr<ASTNode>> children;
	std::vector<std::shared_ptr<ASTNode>> genericParams;		// For generic functions/structs declarations <T>
	std::vector<std::string> genericArgs;										// For generic calls/instantiations <I32>
	std::vector<std::shared_ptr<ASTNode>> genericArgsNodes; // New: AST nodes for generic args
	std::vector<std::string> lifetimeParams;								// For lifetime declarations <a, b>
	std::string lifetime;																		// For pointer types: *a I32
	std::vector<std::string> fieldNames;										// For struct literals (filled by TypeChecker)

	// Type information (filled by TypeChecker)
	std::string inferredType;								 // DEPRECATED: Use exprType instead
	std::shared_ptr<ASTNode> typeNode;			 // New: AST node for explicit type annotation
	std::shared_ptr<ASTNode> returnTypeNode; // New: AST node for function return type
	ExprPtr exprType;												 // New unified expression/type system
	std::string typeBound;									 // For type parameters with bounds: T : SomeType
	std::shared_ptr<ASTNode> typeBoundNode;	 // New: AST node for type bound
	bool isMutable = false;									 // For LET_STMT
	bool isNarrowedUnion = false;						 // For union type narrowing - indicates value is wrapped
	bool calleeIsExtern = false;						 // For CALL_EXPR - true if callee is an extern function
	TypeEnvironment typeEnv;								 // Type variable substitutions for generics

	// Helper to add a child
	void addChild(std::shared_ptr<ASTNode> child)
	{
		children.push_back(child);
	}
};
