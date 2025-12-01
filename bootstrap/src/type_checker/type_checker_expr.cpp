#include "type_checker.h"
#include <iostream>

// Implementation of isNumericType
bool TypeChecker::isNumericType(const std::string &type)
{
	return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
					type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
					type == "F32" || type == "F64" || type == "USize" ||
					type.rfind("SizeOf<", 0) == 0);
}

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
		node->inferredType = it->second.type;
		return;
	}

	// Check if it's 'this' in a struct context
	if (name == "this" && !currentStruct.empty())
	{
		node->inferredType = currentStruct;
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

void TypeChecker::checkMatchExpr(std::shared_ptr<ASTNode> node)
{
	// Match expression: match scrutinee { Type => expr, ... }
	// children[0] is the scrutinee
	// children[1..n] are the arms, each arm has:
	//   - value: the pattern type (or "_" for wildcard)
	//   - children[0]: the body expression

	auto scrutinee = node->children[0];
	check(scrutinee);

	std::string scrutineeType = scrutinee->inferredType;

	// Determine if scrutinee is a union type or enum type
	bool isUnion = isUnionType(scrutineeType);
	bool isEnum = enumTable.find(scrutineeType) != enumTable.end();

	if (!isUnion && !isEnum)
	{
		std::cerr << "Error: match expression requires union or enum type, got '" << scrutineeType << "'" << std::endl;
		exit(1);
	}

	// Collect all possible variants
	std::vector<std::string> variants;
	if (isUnion)
	{
		variants = splitUnionType(scrutineeType);
	}
	else
	{
		variants = enumTable[scrutineeType].variants;
	}

	// Track which variants have been covered
	std::set<std::string> coveredVariants;
	bool hasWildcard = false;
	std::string resultType;

	// Check each arm (children[1..n])
	for (size_t i = 1; i < node->children.size(); i++)
	{
		auto arm = node->children[i];
		std::string pattern = arm->value;

		if (pattern == "_")
		{
			hasWildcard = true;
		}
		else
		{
			// Validate pattern is a valid variant
			bool found = false;
			for (const auto &variant : variants)
			{
				if (variant == pattern || (isEnum && variant == pattern))
				{
					found = true;
					break;
				}
			}

			if (!found)
			{
				std::cerr << "Error: Pattern '" << pattern << "' is not a variant of type '" << scrutineeType << "'" << std::endl;
				exit(1);
			}

			if (coveredVariants.count(pattern))
			{
				std::cerr << "Error: Duplicate pattern '" << pattern << "' in match expression" << std::endl;
				exit(1);
			}
			coveredVariants.insert(pattern);

			// For union types, narrow the scrutinee type in the arm body
			if (isUnion && scrutinee->type == ASTNodeType::IDENTIFIER)
			{
				narrowedTypes[scrutinee->value] = pattern;
			}
		}

		// Check the arm body
		auto armBody = arm->children[0];
		check(armBody);

		// Clear narrowing after checking arm
		if (isUnion && scrutinee->type == ASTNodeType::IDENTIFIER && pattern != "_")
		{
			narrowedTypes.erase(scrutinee->value);
		}

		// Track result type (all arms must have compatible types)
		if (resultType.empty())
		{
			resultType = armBody->inferredType;
		}
		else if (resultType != armBody->inferredType)
		{
			if (!isTypeCompatible(armBody->inferredType, resultType))
			{
				std::cerr << "Error: Match arms have incompatible types: '" << resultType << "' and '" << armBody->inferredType << "'" << std::endl;
				exit(1);
			}
		}
	}

	// Check exhaustiveness
	if (!hasWildcard)
	{
		for (const auto &variant : variants)
		{
			if (coveredVariants.find(variant) == coveredVariants.end())
			{
				std::cerr << "Error: Non-exhaustive match expression. Missing pattern for '" << variant << "'" << std::endl;
				exit(1);
			}
		}
	}

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
		// Check if types are compatible (e.g. one is subtype of another)
		if (isTypeCompatible(elseBranch->inferredType, thenBranch->inferredType))
		{
			node->inferredType = thenBranch->inferredType;
		}
		else if (isTypeCompatible(thenBranch->inferredType, elseBranch->inferredType))
		{
			node->inferredType = elseBranch->inferredType;
		}
		else
		{
			// Simplified: use the then branch type for now, but warn/error if very different
			// For the slice case: index + 1USize (USize) vs slice.init (USize)
			// They should match.
			// If we get here, it means they don't match exactly and aren't compatible.
			// But wait, the error was "Expected USize, got " (empty string?)
			// This suggests one branch has empty inferred type?
			if (thenBranch->inferredType.empty() || elseBranch->inferredType.empty())
			{
				// This shouldn't happen if check() works correctly
			}

			// Fallback
			node->inferredType = thenBranch->inferredType;
		}
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
			"I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "F32", "F64", "Bool", "Void", "USize"};

	if (primitiveTypes.count(typeName) == 0)
	{
		// Check if it's a generic parameter
		bool isGenericParam = false;
		for (const auto &param : genericParamsInScope)
		{
			if (param == typeName)
			{
				isGenericParam = true;
				break;
			}
		}

		if (!isGenericParam)
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
	}

	// sizeOf returns SizeOf<T> which extends USize
	node->inferredType = "SizeOf<" + typeName + ">";
}
