// Ownership and lifetime checking for pointers
#include "type_checker.h"
#include <iostream>

bool TypeChecker::isPointerType(const std::string &type)
{
	if (type.empty())
		return false;
	return type[0] == '*';
}

// Get the origin scope depth of an expression that evaluates to a pointer
// Returns -1 if the pointer is safe (references static/global data or is a parameter)
// Returns >= 0 for the scope depth of the local variable being referenced
int TypeChecker::getExprOriginScope(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return -1;

	switch (node->type)
	{
	case ASTNodeType::REFERENCE_EXPR:
	{
		// &x or &mut x - find the scope depth of x
		auto operand = node->children[0];
		if (operand->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = operand->value;
			auto it = symbolTable.find(name);
			if (it != symbolTable.end())
			{
				// Return the scope depth of the referenced variable
				return it->second.scopeDepth;
			}
		}
		else if (operand->type == ASTNodeType::FIELD_ACCESS)
		{
			// &struct.field - get origin of the struct
			auto base = operand->children[0];
			return getExprOriginScope(base);
		}
		// Unknown reference target - assume safe
		return -1;
	}

	case ASTNodeType::IDENTIFIER:
	{
		// Variable that holds a pointer - check if we tracked its origin
		std::string name = node->value;
		auto it = pointerOrigins.find(name);
		if (it != pointerOrigins.end())
		{
			return it->second;
		}
		// Not tracked - could be a parameter pointer (safe) or unknown
		auto symIt = symbolTable.find(name);
		if (symIt != symbolTable.end())
		{
			// If it's a function parameter (scope depth == functionScopeDepth), it's safe
			// Parameters outlive the function body
			if (symIt->second.scopeDepth == functionScopeDepth)
			{
				return -1; // Safe - parameter
			}
		}
		return -1; // Unknown - assume safe
	}

	case ASTNodeType::CALL_EXPR:
	{
		// Function calls return pointers with unknown origins
		// In a full implementation, we'd track function return lifetimes
		return -1; // Assume safe for now
	}

	case ASTNodeType::IF_EXPR:
	{
		// if expr - take the worst case (highest scope depth) of both branches
		if (node->children.size() >= 3)
		{
			int thenOrigin = getExprOriginScope(node->children[1]);
			int elseOrigin = getExprOriginScope(node->children[2]);
			return std::max(thenOrigin, elseOrigin);
		}
		return -1;
	}

	default:
		return -1; // Unknown - assume safe
	}
}

void TypeChecker::checkReturnLifetime(std::shared_ptr<ASTNode> node, std::shared_ptr<ASTNode> expr)
{
	// Only check if return type is a pointer
	if (!isPointerType(currentFunctionReturnType))
		return;

	int originScope = getExprOriginScope(expr);

	// If the pointer references a local variable (scope > functionScopeDepth),
	// it would dangle after the function returns
	if (originScope > functionScopeDepth)
	{
		int line = expr->line > 0 ? expr->line : node->line;
		std::cerr << "Error: Cannot return pointer to local variable - it would create a dangling pointer at line "
							<< line << "." << std::endl;
		exit(1);
	}
}
