// Ownership and lifetime checking for pointers
#include "type_checker.h"
#include <algorithm>
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

// Get the base variable name from a reference expression (handles field access)
std::string TypeChecker::getBaseVariable(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return "";

	if (node->type == ASTNodeType::IDENTIFIER)
	{
		return node->value;
	}
	else if (node->type == ASTNodeType::FIELD_ACCESS)
	{
		// For struct.field, get the base struct variable
		return getBaseVariable(node->children[0]);
	}
	else if (node->type == ASTNodeType::DEREF_EXPR)
	{
		// For *ptr, get the pointer variable
		return getBaseVariable(node->children[0]);
	}
	return "";
}

// Record a new borrow of a variable
void TypeChecker::recordBorrow(const std::string &variable, BorrowKind kind, int line, const std::string &borrower)
{
	if (variable.empty())
		return;

	BorrowInfo info;
	info.kind = kind;
	info.scopeDepth = currentScopeDepth;
	info.line = line;
	info.borrower = borrower;

	activeBorrows[variable].push_back(info);
}

// Check for borrow conflicts before creating a new borrow
void TypeChecker::checkBorrowConflicts(const std::string &variable, BorrowKind requestedKind, int line)
{
	if (variable.empty())
		return;

	auto it = activeBorrows.find(variable);
	if (it == activeBorrows.end() || it->second.empty())
		return; // No existing borrows

	const std::vector<BorrowInfo> &borrows = it->second;

	if (requestedKind == BorrowKind::MUTABLE)
	{
		// Mutable borrow requires no existing borrows of any kind
		for (const auto &borrow : borrows)
		{
			if (borrow.kind == BorrowKind::MUTABLE)
			{
				std::cerr << "Error: Cannot borrow '" << variable << "' as mutable because it is already mutably borrowed by '"
									<< borrow.borrower << "' (line " << borrow.line << ") at line " << line << "." << std::endl;
				exit(1);
			}
			else
			{
				std::cerr << "Error: Cannot borrow '" << variable << "' as mutable because it is already borrowed by '"
									<< borrow.borrower << "' (line " << borrow.line << ") at line " << line << "." << std::endl;
				exit(1);
			}
		}
	}
	else
	{
		// Shared borrow is only blocked by existing mutable borrows
		for (const auto &borrow : borrows)
		{
			if (borrow.kind == BorrowKind::MUTABLE)
			{
				std::cerr << "Error: Cannot borrow '" << variable << "' because it is mutably borrowed by '"
									<< borrow.borrower << "' (line " << borrow.line << ") at line " << line << "." << std::endl;
				exit(1);
			}
		}
	}
}

// Release all borrows created at or after the given scope depth
void TypeChecker::releaseBorrowsAtScope(int scopeDepth)
{
	for (auto &pair : activeBorrows)
	{
		auto &borrows = pair.second;
		borrows.erase(
				std::remove_if(borrows.begin(), borrows.end(),
											 [scopeDepth](const BorrowInfo &b)
											 { return b.scopeDepth >= scopeDepth; }),
				borrows.end());
	}
}
