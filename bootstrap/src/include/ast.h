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
	template<typename T>
	bool is() const {
		return data.has_value() && std::holds_alternative<T>(*data);
	}
	
	// Get typed variant (throws if wrong type)
	template<typename T>
	T& as() {
		return std::get<T>(*data);
	}
	
	template<typename T>
	const T& as() const {
		return std::get<T>(*data);
	}
	
	// Get typed variant pointer (returns nullptr if wrong type)
	template<typename T>
	T* asPtr() {
		if (!data.has_value()) return nullptr;
		return std::get_if<T>(&*data);
	}
	
	template<typename T>
	const T* asPtr() const {
		if (!data.has_value()) return nullptr;
		return std::get_if<T>(&*data);
	}
	
	// Check if typed data is set
	bool hasTypedData() const {
		return data.has_value();
	}
	
	// Get ASTNodeType from variant (or legacy type field)
	ASTNodeType getType() const {
		if (data.has_value()) {
			return getNodeType(*data);
		}
		return type;
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
