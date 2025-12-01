#include "type_checker.h"
#include <iostream>

void TypeChecker::checkIdentifier(std::shared_ptr<ASTNode> node)
{
	std::string name = node->value;

	// First check if it's an FQN reference
	if (enumTable.find(name) != enumTable.end())
	{
		node->inferredType = name; // Type is the enum name itself (possibly with FQN)
		return;
	}

	// Check narrowed types first (for union type narrowing after 'is' checks)
	auto narrowedIt = narrowedTypes.find(name);
	if (narrowedIt != narrowedTypes.end())
	{
		node->inferredType = narrowedIt->second;
		node->isNarrowedUnion = true; // Mark that this is a narrowed union (value is still wrapped)
		return;
	}

	// Check if it's a local variable/parameter in symbol table
	auto it = symbolTable.find(name);
	if (it != symbolTable.end())
	{
		// Check if variable has been moved
		checkNotMoved(name);
		node->inferredType = it->second.type;
		return;
	}

	// If not found and we're in a module context, try prefixing with module name
	if (!currentModule.empty())
	{
		std::string fqn = currentModule + "::" + name;
		if (enumTable.find(fqn) != enumTable.end())
		{
			node->value = fqn; // Update to FQN
			node->inferredType = fqn;
			return;
		}
	}

	// Try imported modules
	for (const auto &imported : importedModules)
	{
		std::string fqn = imported + "::" + name;
		if (enumTable.find(fqn) != enumTable.end())
		{
			node->value = fqn; // Update to FQN
			node->inferredType = fqn;
			return;
		}
	}

	// If still not found, error
	std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
	exit(1);
}

void TypeChecker::checkIsExpr(std::shared_ptr<ASTNode> node)
{
	// is operator: expr is Type
	auto expr = node->children[0];
	check(expr);

	std::string targetType = node->value; // The type we're checking against

	// Validate that the expression type is a union type
	if (!isUnionType(expr->inferredType))
	{
		std::cerr << "Error: 'is' operator can only be used on union types, got " << expr->inferredType << std::endl;
		exit(1);
	}

	// Validate that target type is one of the union variants
	auto variants = splitUnionType(expr->inferredType);
	bool found = false;
	for (const auto &variant : variants)
	{
		if (variant == targetType)
		{
			found = true;
			break;
		}
	}
	if (!found)
	{
		std::cerr << "Error: Type '" << targetType << "' is not a variant of union type '" << expr->inferredType << "'" << std::endl;
		exit(1);
	}

	node->inferredType = "Bool";
}

void TypeChecker::checkIntersectionExpr(std::shared_ptr<ASTNode> node)
{
	// Intersection expression: expr & expr (struct merging)
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = left->inferredType;
	std::string rightType = right->inferredType;

	// Both types must be structs (or intersections of structs)
	// Validate left type
	if (!isIntersectionType(leftType))
	{
		auto it = structTable.find(leftType);
		if (it == structTable.end())
		{
			std::cerr << "Error: Left operand of '&' must be a struct type, got '" << leftType << "'" << std::endl;
			exit(1);
		}
	}

	// Validate right type
	if (!isIntersectionType(rightType))
	{
		auto it = structTable.find(rightType);
		if (it == structTable.end())
		{
			std::cerr << "Error: Right operand of '&' must be a struct type, got '" << rightType << "'" << std::endl;
			exit(1);
		}
	}

	// Result type is intersection of both types
	std::string resultType = leftType + "&" + rightType;

	// Validate that the intersection doesn't have conflicting fields
	validateIntersectionType(resultType);

	node->inferredType = resultType;
}

void TypeChecker::checkUnaryOp(std::shared_ptr<ASTNode> node)
{
	auto operand = node->children[0];
	check(operand);

	std::string op = node->value;
	if (op == "!")
	{
		if (operand->inferredType != "Bool")
		{
			std::cerr << "Error: Operand of '!' must be Bool, got " << operand->inferredType << std::endl;
			exit(1);
		}
		node->inferredType = "Bool";
	}
	else if (op == "-")
	{
		if (!isNumericType(operand->inferredType))
		{
			std::cerr << "Error: Operand of '-' must be numeric, got " << operand->inferredType << std::endl;
			exit(1);
		}
		node->inferredType = operand->inferredType;
	}
}

void TypeChecker::checkIfExpr(std::shared_ptr<ASTNode> node)
{
	auto condition = node->children[0];
	check(condition);
	if (condition->inferredType != "Bool")
	{
		std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
		exit(1);
	}

	auto thenBranch = node->children[1];
	auto elseBranch = node->children[2];
	check(thenBranch);
	check(elseBranch);

	// For now, just use the then branch type (union types deferred)
	if (thenBranch->inferredType == elseBranch->inferredType)
	{
		node->inferredType = thenBranch->inferredType;
	}
	else
	{
		// Simplified: use the then branch type for now
		node->inferredType = thenBranch->inferredType;
	}
}

void TypeChecker::checkSizeOfExpr(std::shared_ptr<ASTNode> node)
{
	// sizeOf(Type) - the type is stored in node->value
	std::string typeName = node->value;

	// Expand type aliases if this is an alias
	typeName = expandTypeAlias(typeName);
	node->value = typeName;

	// Validate that the type is valid
	// Primitives are always valid
	std::set<std::string> primitiveTypes = {
			"I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "F32", "F64", "Bool", "Void"};

	if (primitiveTypes.count(typeName) == 0)
	{
		// Check if it's a struct type
		if (structTable.find(typeName) == structTable.end())
		{
			// Check if it's an array type [T; init; capacity]
			if (typeName[0] != '[')
			{
				std::cerr << "Error: sizeOf argument must be a valid type, got '" << typeName << "'" << std::endl;
				exit(1);
			}
		}
	}

	// sizeOf returns SizeOf<T> which extends USize
	node->inferredType = "SizeOf<" + typeName + ">";
}
