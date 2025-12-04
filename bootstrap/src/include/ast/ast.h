#pragma once
#include <string>
#include <vector>
#include <memory>
#include <optional>
#include "token.h"
#include "expr.h"
#include "type_env.h"
#include "ast_nodes.h"

// ASTNode is the main AST type used throughout the compiler.
// It wraps ASTNodeVariant (typed node) with common metadata.
//
// MIGRATION STRATEGY:
// - The 'data' field holds the typed variant (when set)
// - Legacy fields (type, value, children, etc.) are preserved for backward compatibility
// - New code should use the typed variant via as<T>() and is<T>()
// - Old code continues to work with legacy fields
//
// Eventually, all code will migrate to using typed variants, and legacy fields
// will be removed.

struct ASTNode
{
	// =========================================================================
	// NEW: Typed variant data (preferred)
	// =========================================================================
	std::optional<ASTNodeVariant> data;

	// =========================================================================
	// LEGACY: Old untyped fields (deprecated, for backward compatibility)
	// =========================================================================
	ASTNodeType type;
	std::string value; // For identifiers, literals, operators
	int line = 0;			 // Source line number
	int column = 0;		 // Source column number
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
	bool isExported = false;								 // For declarations - true if marked with 'out' keyword
	TypeEnvironment typeEnv;								 // Type variable substitutions for generics

	// =========================================================================
	// NEW: Typed access methods
	// =========================================================================

	// Check if this node holds a specific typed variant
	template <typename T>
	bool is() const
	{
		return data.has_value() && std::holds_alternative<T>(*data);
	}

	// Get typed variant (throws if wrong type)
	template <typename T>
	T &as()
	{
		return std::get<T>(*data);
	}

	template <typename T>
	const T &as() const
	{
		return std::get<T>(*data);
	}

	// Get typed variant pointer (returns nullptr if wrong type)
	template <typename T>
	T *asPtr()
	{
		if (!data.has_value())
			return nullptr;
		return std::get_if<T>(&*data);
	}

	template <typename T>
	const T *asPtr() const
	{
		if (!data.has_value())
			return nullptr;
		return std::get_if<T>(&*data);
	}

	// Check if typed data is set
	bool hasTypedData() const
	{
		return data.has_value();
	}

	// Get ASTNodeType from variant (or legacy type field)
	ASTNodeType getType() const
	{
		if (data.has_value())
		{
			return getNodeType(*data);
		}
		return type;
	}

	// Set typed variant data
	template <typename T>
	void setData(T &&nodeData)
	{
		data = std::forward<T>(nodeData);
	}

	// =========================================================================
	// LEGACY: Helper methods
	// =========================================================================

	// Helper to add a child
	void addChild(std::shared_ptr<ASTNode> child)
	{
		children.push_back(child);
	}
};

// =============================================================================
// FACTORY FUNCTIONS: Create ASTNode with typed variant data
// =============================================================================

// Helper to create an ASTNode with both legacy fields and typed variant data
template <typename T>
inline std::shared_ptr<ASTNode> makeNode(T &&nodeData, int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = getNodeType(nodeData);
	node->line = line;
	node->column = column;
	node->data = std::forward<T>(nodeData);
	return node;
}

// Literal node factory
inline std::shared_ptr<ASTNode> makeLiteralNode(const std::string &value, const std::string &literalType,
																								int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::LITERAL;
	node->value = value;
	node->inferredType = literalType;
	node->line = line;
	node->column = column;
	node->data = LiteralNode{value, literalType};
	return node;
}

// Identifier node factory
inline std::shared_ptr<ASTNode> makeIdentifierNode(const std::string &name, int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::IDENTIFIER;
	node->value = name;
	node->line = line;
	node->column = column;
	node->data = IdentifierNode{name};
	return node;
}

// String literal factory
inline std::shared_ptr<ASTNode> makeStringLiteralNode(const std::string &value, int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::STRING_LITERAL;
	node->value = value;
	node->inferredType = "string";
	node->line = line;
	node->column = column;
	node->data = StringLiteralNode{value};
	return node;
}

// Char literal factory
inline std::shared_ptr<ASTNode> makeCharLiteralNode(char value, int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::CHAR_LITERAL;
	node->value = std::to_string(static_cast<int>(value));
	node->inferredType = "U8";
	node->line = line;
	node->column = column;
	node->data = CharLiteralNode{value};
	return node;
}

// Binary operation factory
inline std::shared_ptr<ASTNode> makeBinaryOpNode(const std::string &op, std::shared_ptr<ASTNode> left,
																								 std::shared_ptr<ASTNode> right, int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::BINARY_OP;
	node->value = op;
	node->line = line;
	node->column = column;
	node->addChild(left);
	node->addChild(right);
	node->data = BinaryOpNode{op, left, right};
	return node;
}

// Unary operation factory
inline std::shared_ptr<ASTNode> makeUnaryOpNode(const std::string &op, std::shared_ptr<ASTNode> operand,
																								int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::UNARY_OP;
	node->value = op;
	node->line = line;
	node->column = column;
	node->addChild(operand);
	node->data = UnaryOpNode{op, operand};
	return node;
}

// Block factory
inline std::shared_ptr<ASTNode> makeBlockNode(const std::vector<std::shared_ptr<ASTNode>> &stmts,
																							int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::BLOCK;
	node->line = line;
	node->column = column;
	for (const auto &stmt : stmts)
	{
		node->addChild(stmt);
	}
	node->data = BlockNode{stmts};
	return node;
}

// Return statement factory
inline std::shared_ptr<ASTNode> makeReturnNode(std::shared_ptr<ASTNode> value = nullptr,
																							 int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::RETURN_STMT;
	node->line = line;
	node->column = column;
	if (value)
	{
		node->addChild(value);
	}
	node->data = ReturnStmtNode{value};
	return node;
}

// Break statement factory
inline std::shared_ptr<ASTNode> makeBreakNode(int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::BREAK_STMT;
	node->line = line;
	node->column = column;
	node->data = BreakStmtNode{};
	return node;
}

// Continue statement factory
inline std::shared_ptr<ASTNode> makeContinueNode(int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::CONTINUE_STMT;
	node->line = line;
	node->column = column;
	node->data = ContinueStmtNode{};
	return node;
}

// Field access factory
inline std::shared_ptr<ASTNode> makeFieldAccessNode(std::shared_ptr<ASTNode> object, const std::string &fieldName,
																										int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::FIELD_ACCESS;
	node->value = fieldName;
	node->line = line;
	node->column = column;
	node->addChild(object);
	node->data = FieldAccessNode{object, fieldName};
	return node;
}

// Index expression factory
inline std::shared_ptr<ASTNode> makeIndexExprNode(std::shared_ptr<ASTNode> array, std::shared_ptr<ASTNode> index,
																									int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::INDEX_EXPR;
	node->line = line;
	node->column = column;
	node->addChild(array);
	node->addChild(index);
	node->data = IndexExprNode{array, index};
	return node;
}

// Call expression factory
inline std::shared_ptr<ASTNode> makeCallExprNode(std::shared_ptr<ASTNode> callee,
																								 const std::vector<std::shared_ptr<ASTNode>> &args,
																								 int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::CALL_EXPR;
	node->line = line;
	node->column = column;
	node->addChild(callee);
	for (const auto &arg : args)
	{
		node->addChild(arg);
	}
	node->data = CallExprNode{callee, args, {}, {}, false};
	return node;
}

// Reference expression factory
inline std::shared_ptr<ASTNode> makeReferenceExprNode(std::shared_ptr<ASTNode> operand, bool isMutable,
																											int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::REFERENCE_EXPR;
	node->isMutable = isMutable;
	node->line = line;
	node->column = column;
	node->addChild(operand);
	node->data = ReferenceExprNode{operand, isMutable};
	return node;
}

// Dereference expression factory
inline std::shared_ptr<ASTNode> makeDerefExprNode(std::shared_ptr<ASTNode> operand,
																									int line = 0, int column = 0)
{
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::DEREF_EXPR;
	node->line = line;
	node->column = column;
	node->addChild(operand);
	node->data = DerefExprNode{operand};
	return node;
}
