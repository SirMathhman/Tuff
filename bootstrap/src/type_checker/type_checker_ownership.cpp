#include "type_checker.h"
#include <iostream>
#include <algorithm>

void TypeChecker::addBorrow(const std::string &variable, const std::string &borrower, bool isMutable)
{
	BorrowInfo borrow;
	borrow.borrower = borrower;
	borrow.isMutable = isMutable;
	borrow.scopeDepth = currentScopeDepth;
	activeBorrows[variable].push_back(borrow);

	// Update ownership state
	auto it = symbolTable.find(variable);
	if (it != symbolTable.end())
	{
		if (isMutable)
		{
			it->second.ownership = OwnershipState::BorrowedMut;
		}
		else if (it->second.ownership == OwnershipState::Owned)
		{
			it->second.ownership = OwnershipState::Borrowed;
		}
	}
}

void TypeChecker::releaseBorrowsAtScope(int depth)
{
	// Remove all borrows created at or deeper than the given scope depth
	for (auto &pair : activeBorrows)
	{
		auto &borrows = pair.second;
		borrows.erase(
				std::remove_if(borrows.begin(), borrows.end(),
											 [depth](const BorrowInfo &b)
											 { return b.scopeDepth >= depth; }),
				borrows.end());

		// Update ownership state if no more borrows
		if (borrows.empty())
		{
			auto it = symbolTable.find(pair.first);
			if (it != symbolTable.end() &&
					(it->second.ownership == OwnershipState::Borrowed ||
					 it->second.ownership == OwnershipState::BorrowedMut))
			{
				it->second.ownership = OwnershipState::Owned;
			}
		}
	}
}

void TypeChecker::checkBorrowConflicts(const std::string &variable, bool wantMutable)
{
	auto it = activeBorrows.find(variable);
	if (it == activeBorrows.end() || it->second.empty())
	{
		return; // No existing borrows, OK
	}

	const auto &borrows = it->second;

	if (wantMutable)
	{
		// Mutable borrow requires NO existing borrows
		if (!borrows.empty())
		{
			std::cerr << "Error: Cannot borrow '" << variable << "' as mutable because it is already borrowed";
			if (borrows[0].isMutable)
			{
				std::cerr << " as mutable";
			}
			std::cerr << " by '" << borrows[0].borrower << "'." << std::endl;
			exit(1);
		}
	}
	else
	{
		// Shared borrow requires no MUTABLE borrows
		for (const auto &borrow : borrows)
		{
			if (borrow.isMutable)
			{
				std::cerr << "Error: Cannot borrow '" << variable << "' as immutable because it is already mutably borrowed by '" << borrow.borrower << "'." << std::endl;
				exit(1);
			}
		}
	}
}

void TypeChecker::checkNotMoved(const std::string &variable)
{
	auto it = symbolTable.find(variable);
	if (it != symbolTable.end() && it->second.ownership == OwnershipState::Moved)
	{
		std::cerr << "Error: Use of moved value '" << variable << "'." << std::endl;
		exit(1);
	}
}

void TypeChecker::moveVariable(const std::string &variable)
{
	auto it = symbolTable.find(variable);
	if (it != symbolTable.end())
	{
		// Check if currently borrowed
		auto borrowIt = activeBorrows.find(variable);
		if (borrowIt != activeBorrows.end() && !borrowIt->second.empty())
		{
			std::cerr << "Error: Cannot move '" << variable << "' while it is borrowed." << std::endl;
			exit(1);
		}
		it->second.ownership = OwnershipState::Moved;
	}
}

std::string TypeChecker::applyLifetimeElision(std::shared_ptr<ASTNode> funcNode)
{
	// Count pointer parameters
	int ptrParamCount = 0;
	std::string singlePtrLifetime = "";

	for (size_t i = 0; i < funcNode->children.size() - 1; i++)
	{
		auto paramNode = funcNode->children[i];
		std::string paramType = paramNode->inferredType;
		if (!paramType.empty() && paramType[0] == '*')
		{
			ptrParamCount++;
			// Extract lifetime if present
			if (paramType.length() > 1 && paramType[1] >= 'a' && paramType[1] <= 'z')
			{
				size_t spacePos = paramType.find(' ');
				if (spacePos != std::string::npos)
				{
					singlePtrLifetime = paramType.substr(1, spacePos - 1);
				}
			}
		}
	}

	std::string returnType = funcNode->inferredType;

	// If return type is a pointer without lifetime and there's exactly one pointer param
	if (!returnType.empty() && returnType[0] == '*')
	{
		// Check if return type already has a lifetime
		bool hasLifetime = returnType.length() > 1 && returnType[1] >= 'a' && returnType[1] <= 'z';

		if (!hasLifetime && ptrParamCount == 1 && !singlePtrLifetime.empty())
		{
			// Apply elision: give return type the same lifetime as the single pointer param
			// Insert lifetime after *
			if (returnType.substr(0, 5) == "*mut ")
			{
				returnType = "*" + singlePtrLifetime + " mut " + returnType.substr(5);
			}
			else
			{
				returnType = "*" + singlePtrLifetime + " " + returnType.substr(1);
			}
			funcNode->inferredType = returnType;
		}
		else if (!hasLifetime && ptrParamCount > 1)
		{
			// Multiple pointer params without explicit lifetime annotation
			std::cerr << "Error: Function '" << funcNode->value
								<< "' returns a pointer but has multiple pointer parameters. "
								<< "Explicit lifetime annotation required." << std::endl;
			exit(1);
		}
	}

	return returnType;
}
std::string TypeChecker::stripLifetime(const std::string &type)
{
	// Convert "*a I32" or "*a mut I32" to "*I32" or "*mut I32"
	if (type.empty() || type[0] != '*')
	{
		return type;
	}

	// Check for lifetime annotation (single lowercase letter after *)
	// Must be a single letter followed by a space, not "mut" or other keywords
	if (type.length() > 2 && type[1] >= 'a' && type[1] <= 'z' && type[2] == ' ')
	{
		// This is a lifetime: *a I32 or *a mut I32
		std::string rest = type.substr(3); // Skip "*a "
		if (rest.substr(0, 4) == "mut ")
		{
			return "*mut " + rest.substr(4);
		}
		else
		{
			return "*" + rest;
		}
	}

	return type;
}

bool TypeChecker::typesMatch(const std::string &actual, const std::string &expected,
														 const std::vector<std::string> &lifetimeParams)
{
	// Fast path: exact match
	if (actual == expected)
	{
		return true;
	}

	// Check if expected type has a lifetime parameter that needs substitution
	// Lifetime format: *a T or *a mut T (single letter followed by space)
	if (expected.length() > 2 && expected[0] == '*' &&
			expected[1] >= 'a' && expected[1] <= 'z' && expected[2] == ' ')
	{
		// Extract the single-letter lifetime name
		std::string lifetimeName(1, expected[1]);
		// Check if this is a declared lifetime parameter
		for (const auto &param : lifetimeParams)
		{
			if (lifetimeName == param)
			{
				// Compare stripped versions using isTypeCompatible for full type system support
				return isTypeCompatible(stripLifetime(actual), stripLifetime(expected));
			}
		}
	}

	// Strip lifetimes and use isTypeCompatible for full type checking
	// This handles type aliases, intersection types with destructors, union types, etc.
	return isTypeCompatible(stripLifetime(actual), stripLifetime(expected));
}