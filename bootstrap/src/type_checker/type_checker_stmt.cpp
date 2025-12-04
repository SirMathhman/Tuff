#include "type_checker.h"
#include <iostream>
#include <functional>

void TypeChecker::checkInLetStmt(std::shared_ptr<ASTNode> node)
{
	std::string name = node->value;
	if (symbolTable.find(name) != symbolTable.end())
	{
		std::cerr << "Error: Variable '" << name << "' already declared at line " << node->line << "." << std::endl;
		exit(1);
	}

	// Resolve explicit type
	if (node->typeNode)
	{
		node->exprType = resolveType(node->typeNode);
		node->exprType = expandTypeAlias(node->exprType);
		node->inferredType = exprTypeToString(node->exprType);
	}
	else
	{
		std::cerr << "Error: 'in let' declaration requires explicit type annotation." << std::endl;
		exit(1);
	}

	// Validate type: must be Array<string>
	// We check string representation for now, but ideally should check structure
	if (node->inferredType != "Array<string>")
	{
		std::cerr << "Error: 'in let' declaration must have type 'Array<string>', got '" << node->inferredType << "'." << std::endl;
		exit(1);
	}

	SymbolInfo info;
	info.type = node->inferredType;
	info.exprType = node->exprType;
	info.isMutable = false;
	symbolTable[name] = info;
}

void TypeChecker::checkLetStmt(std::shared_ptr<ASTNode> node)
{
	std::string name = node->value;
	if (symbolTable.find(name) != symbolTable.end())
	{
		auto existing = symbolTable[name];
		std::cerr << "Error: Variable '" << name << "' already declared (no shadowing allowed) at line " << node->line << " in module " << currentModule << "." << std::endl;
		std::cerr << "  Existing variable has type: " << existing.type << ", scopeDepth: " << existing.scopeDepth << ", currentScopeDepth: " << currentScopeDepth << std::endl;
		exit(1);
	}

	auto init = node->children[0];
	check(init);

	// Resolve explicit type if present
	if (node->typeNode)
	{
		node->exprType = resolveType(node->typeNode);
		node->exprType = expandTypeAlias(node->exprType);
	}

	std::string type = node->inferredType;
	if (type == "Inferred" || type.empty())
	{
		if (node->exprType)
		{
			// Explicit type was resolved
			type = exprTypeToString(node->exprType);
		}
		else
		{
			// Infer from init
			node->exprType = init->exprType;
			if (node->exprType)
				node->exprType = expandTypeAlias(node->exprType);
			type = init->inferredType;
		}
		node->inferredType = type; // Update AST with inferred type
	}
	else
	{
		// Expand type aliases in the declared type
		type = expandTypeAlias(type);
		node->inferredType = type;

		if (node->exprType && init->exprType)
		{
			// Expand aliases in init type too
			init->exprType = expandTypeAlias(init->exprType);

			if (!isTypeCompatible(init->exprType, node->exprType))
			{
				std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << exprTypeToString(node->exprType) << ", got " << exprTypeToString(init->exprType) << std::endl;
				exit(1);
			}
		}
		else
		{
			if (!isTypeCompatible(init->inferredType, type))
			{
				std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << type << ", got " << init->inferredType << std::endl;
				exit(1);
			}
		}
	}

	SymbolInfo info;
	info.type = node->inferredType;
	info.exprType = node->exprType;
	info.isMutable = node->isMutable;
	info.scopeDepth = currentScopeDepth;
	symbolTable[name] = info;

	// Move semantics: if assigning from a non-copy type variable, mark it as moved
	if (init->type == ASTNodeType::IDENTIFIER && !isCopyType(type))
	{
		markAsMoved(init->value, node->line);
	}

	// Track pointer origins for dangling pointer detection
	if (isPointerType(node->inferredType))
	{
		int origin = getExprOriginScope(init);
		if (origin >= 0)
		{
			pointerOrigins[name] = origin;
		}

		// Record borrow for the referenced variable
		if (init->type == ASTNodeType::REFERENCE_EXPR)
		{
			std::string baseVar = getBaseVariable(init->children[0]);
			if (!baseVar.empty())
			{
				BorrowKind kind = init->isMutable ? BorrowKind::MUTABLE : BorrowKind::SHARED;
				int borrowLine = init->line > 0 ? init->line : node->line;
				recordBorrow(baseVar, kind, borrowLine, name);
			}
		}
	}
}

void TypeChecker::checkAssignmentStmt(std::shared_ptr<ASTNode> node)
{
	// Check if it's a field assignment or simple variable assignment
	auto lhs = node->children[0];
	auto value = node->children[1];

	check(lhs); // This will set the inferred type of lhs
	check(value);

	// For field access, lhs already has its type checked
	// For simple identifier, check mutability
	if (lhs->type == ASTNodeType::IDENTIFIER)
	{
		std::string name = lhs->value;
		auto it = symbolTable.find(name);
		if (it == symbolTable.end())
		{
			std::cerr << "Error: Variable '" << name << "' not declared at line " << lhs->line << "." << std::endl;
			exit(1);
		}

		if (!it->second.isMutable)
		{
			std::cerr << "Error: Cannot assign to immutable variable '" << name << "' at line " << lhs->line << "." << std::endl;
			exit(1);
		}
	}

	// Validate type compatibility
	if (lhs->exprType && value->exprType)
	{
		lhs->exprType = expandTypeAlias(lhs->exprType);
		value->exprType = expandTypeAlias(value->exprType);

		if (!isTypeCompatible(value->exprType, lhs->exprType))
		{
			std::cerr << "Error: Type mismatch in assignment. Expected " << exprTypeToString(lhs->exprType) << ", got " << exprTypeToString(value->exprType) << std::endl;
			exit(1);
		}
	}
	else
	{
		// Use string-based type compatibility with alias expansion and intersection stripping
		std::string expectedType = expandTypeAlias(lhs->inferredType);
		std::string actualType = expandTypeAlias(value->inferredType);

		// Strip intersection from both types (e.g., *mut [T] & #free -> *mut [T])
		auto stripIntersection = [](std::string &type)
		{
			size_t ampPos = type.find(" & ");
			if (ampPos == std::string::npos)
			{
				ampPos = type.find("&");
				if (ampPos != std::string::npos && ampPos + 1 < type.length())
				{
					char nextChar = type[ampPos + 1];
					if (nextChar != '#' && !std::isupper(nextChar))
					{
						return;
					}
				}
			}
			if (ampPos != std::string::npos)
			{
				type = type.substr(0, ampPos);
			}
		};

		stripIntersection(expectedType);
		stripIntersection(actualType);

		if (!isTypeCompatible(actualType, expectedType))
		{
			std::cerr << "Error: Type mismatch in assignment. Expected " << lhs->inferredType << ", got " << value->inferredType << std::endl;
			std::cerr << "  (expanded: expected '" << expectedType << "', got '" << actualType << "')" << std::endl;
			exit(1);
		}
	}
}

void TypeChecker::checkIfStmt(std::shared_ptr<ASTNode> node)
{
	auto condition = node->children[0];
	check(condition);
	if (condition->inferredType != "Bool")
	{
		std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
		exit(1);
	}

	// Type narrowing: collect all `x is SomeType` from compound conditions
	// For `(a is T1) && (b is T2)`, narrow both a and b in the then-branch
	std::vector<std::pair<std::string, ExprPtr>> narrowings;

	// For inverse narrowing: !(x is T) followed by early return
	std::vector<std::pair<std::string, ExprPtr>> inverseNarrowings;

	// Helper to extract is-expressions from condition
	std::function<void(std::shared_ptr<ASTNode>, bool)> collectNarrowings = [&](std::shared_ptr<ASTNode> cond, bool negated)
	{
		if (!cond)
			return;

		// Simple is-expression: x is Type
		if (cond->type == ASTNodeType::IS_EXPR && cond->children[0]->type == ASTNodeType::IDENTIFIER)
		{
			std::string varName = cond->children[0]->value;
			ExprPtr narrowedType;
			if (cond->typeNode)
			{
				narrowedType = resolveType(cond->typeNode);
			}
			else
			{
				narrowedType = std::make_shared<IdentifierExpr>(cond->value);
			}

			if (negated)
			{
				// !(x is T) - we'll apply this narrowing after the if block if it always returns
				inverseNarrowings.push_back({varName, narrowedType});
			}
			else
			{
				narrowings.push_back({varName, narrowedType});
			}
		}
		// Compound && condition: recurse into both sides
		else if (cond->type == ASTNodeType::BINARY_OP && cond->value == "&&")
		{
			collectNarrowings(cond->children[0], negated);
			collectNarrowings(cond->children[1], negated);
		}
		// Negation: !(expr)
		else if (cond->type == ASTNodeType::UNARY_OP && cond->value == "!")
		{
			collectNarrowings(cond->children[0], !negated);
		}
	};

	collectNarrowings(condition, false);

	// Apply all narrowings for the then-branch
	for (const auto &n : narrowings)
	{
		narrowedTypes[n.first] = n.second;
	}

	auto thenBranch = node->children[1];
	check(thenBranch);

	// Clear type narrowings after then-branch
	for (const auto &n : narrowings)
	{
		narrowedTypes.erase(n.first);
	}

	// If then-branch always returns and we have inverse narrowings,
	// apply them for the code after the if statement
	bool thenAlwaysReturns = blockAlwaysReturns(thenBranch);

	if (node->children.size() > 2)
	{
		auto elseBranch = node->children[2];
		check(elseBranch);

		// Infer type from branches
		if (thenBranch->inferredType == elseBranch->inferredType)
		{
			node->inferredType = thenBranch->inferredType;
			node->exprType = thenBranch->exprType;
		}
		else
		{
			// If one is Void, result is Void
			// Or if types mismatch (should be error if used as expression, but here we just mark as Void/Incompatible)
			// For now, just set to Void if mismatch
			node->inferredType = "Void";
			node->exprType = makePrimitive(PrimitiveKind::Void);
		}
	}
	else
	{
		node->inferredType = "Void";
		node->exprType = makePrimitive(PrimitiveKind::Void);

		// No else branch: if then always returns, apply inverse narrowings
		// This handles: if (!(x is T)) { return; } followed by x.value
		if (thenAlwaysReturns)
		{
			for (const auto &n : inverseNarrowings)
			{
				narrowedTypes[n.first] = n.second;
			}
		}
	}
}

void TypeChecker::checkWhileStmt(std::shared_ptr<ASTNode> node)
{
	auto condition = node->children[0];
	check(condition);
	if (condition->inferredType != "Bool")
	{
		std::cerr << "Error: While condition must be Bool, got " << condition->inferredType << std::endl;
		exit(1);
	}

	auto body = node->children[1];
	check(body);
}

void TypeChecker::checkLoopStmt(std::shared_ptr<ASTNode> node)
{
	auto body = node->children[0];
	check(body);
}

void TypeChecker::checkBlock(std::shared_ptr<ASTNode> node)
{
	// Create new scope for block
	auto savedSymbols = symbolTable;
	currentScopeDepth++;

	for (auto child : node->children)
	{
		check(child);
	}

	// If block is used as expression, its type is the type of the last statement
	if (!node->children.empty())
	{
		auto lastChild = node->children.back();
		if (!lastChild->inferredType.empty() && lastChild->inferredType != "Void")
		{
			node->inferredType = lastChild->inferredType;
		}
		else
		{
			node->inferredType = "Void";
		}
	}
	else
	{
		node->inferredType = "Void";
	}

	// Release borrows created in this scope before exiting
	releaseBorrowsAtScope(currentScopeDepth);

	currentScopeDepth--;

	// Restore scope after block
	symbolTable = savedSymbols;
}

void TypeChecker::checkReturnStmt(std::shared_ptr<ASTNode> node)
{
	if (currentFunctionReturnType.empty())
	{
		std::cerr << "Error: Return statement outside of function." << std::endl;
		exit(1);
	}

	if (node->children.empty())
	{
		// return; with no value
		if (currentFunctionReturnType != "Void")
		{
			std::cerr << "Error: Function expects return type " << currentFunctionReturnType
								<< ", but got void return." << std::endl;
			exit(1);
		}
	}
	else
	{
		// return expr;
		auto expr = node->children[0];
		check(expr);
		if (!isTypeCompatible(expr->inferredType, currentFunctionReturnType))
		{
			std::cerr << "Error: Function expects return type " << currentFunctionReturnType
								<< ", but got " << expr->inferredType << std::endl;
			exit(1);
		}

		// Check for dangling pointers
		checkReturnLifetime(node, expr);
	}
}

// Check if a statement/block always returns (never falls through)
bool TypeChecker::blockAlwaysReturns(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return false;

	switch (node->type)
	{
	case ASTNodeType::RETURN_STMT:
		return true;

	case ASTNodeType::BREAK_STMT:
	case ASTNodeType::CONTINUE_STMT:
		return true;

	case ASTNodeType::BLOCK:
		// A block always returns if any statement in it always returns
		for (auto child : node->children)
		{
			if (blockAlwaysReturns(child))
				return true;
		}
		return false;

	case ASTNodeType::IF_STMT:
		// If statement always returns only if both branches exist and both return
		if (node->children.size() >= 3)
		{
			return blockAlwaysReturns(node->children[1]) && blockAlwaysReturns(node->children[2]);
		}
		return false;

	default:
		return false;
	}
}
