#include "type_checker.h"
#include <iostream>
#include <sstream>

// Implementation of isNumericType (moved here to avoid circular dependency)
bool TypeChecker::isNumericType(const std::string &type)
{
	// Handle multiple-of types by extracting base type
	if (isMultipleOfType(type))
	{
		std::string baseType = getMultipleOfBaseType(type);
		return (baseType == "I32" || baseType == "I64" || baseType == "I8" || baseType == "I16" ||
						baseType == "U8" || baseType == "U16" || baseType == "U32" || baseType == "U64" ||
						baseType == "F32" || baseType == "F64" || baseType == "USize");
	}

	return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
					type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
					type == "F32" || type == "F64" || type == "USize" ||
					type.rfind("SizeOf<", 0) == 0);
}

// Helper: Check if a type is a multiple-of type (contains '*' with numeric literal)
bool TypeChecker::isMultipleOfType(const std::string &type)
{
	size_t starPos = type.find('*');
	if (starPos == std::string::npos)
		return false;

	// Check if it's a pointer type (starts with *)
	if (starPos == 0)
		return false;

	// Check if what comes after * is a numeric literal
	if (starPos + 1 < type.length())
	{
		char next = type[starPos + 1];
		return next >= '0' && next <= '9';
	}

	return false;
}

// Helper: Parse multiple-of type into base type and constraints
// E.g., "I32*5I32+I32*3I32" -> base="I32", constraints=["5I32", "3I32"]
// E.g., "I32*10I32" -> base="I32", constraints=["10I32"]
void TypeChecker::parseMultipleOfType(const std::string &type, std::string &baseType, std::vector<std::string> &constraints)
{
	baseType = "";
	constraints.clear();

	// Split by + to get individual terms
	std::vector<std::string> terms;
	std::string current;
	for (char c : type)
	{
		if (c == '+')
		{
			if (!current.empty())
			{
				terms.push_back(current);
				current = "";
			}
		}
		else
		{
			current += c;
		}
	}
	if (!current.empty())
	{
		terms.push_back(current);
	}

	// Parse each term
	for (const auto &term : terms)
	{
		size_t starPos = term.find('*');
		if (starPos == std::string::npos)
		{
			// Simple type, not a multiple-of constraint
			if (baseType.empty())
			{
				baseType = term;
			}
			else if (baseType != term)
			{
				std::cerr << "Error: Inconsistent base types in multiple-of expression: " << baseType << " vs " << term << std::endl;
				exit(1);
			}
		}
		else
		{
			// Multiple-of constraint
			std::string termBase = term.substr(0, starPos);
			std::string constraint = term.substr(starPos + 1);

			if (baseType.empty())
			{
				baseType = termBase;
			}
			else if (baseType != termBase)
			{
				std::cerr << "Error: Inconsistent base types in multiple-of expression: " << baseType << " vs " << termBase << std::endl;
				exit(1);
			}

			constraints.push_back(constraint);
		}
	}
}

// Helper: Extract numeric value from a literal (strip type suffix)
// E.g., "10I32" -> 10, "5U64" -> 5
long long TypeChecker::extractLiteralValue(const std::string &literal)
{
	std::string numStr;
	for (char c : literal)
	{
		if (isdigit(c) || c == '-')
		{
			numStr += c;
		}
		else
		{
			break; // Stop at type suffix
		}
	}

	if (numStr.empty())
	{
		std::cerr << "Error: Invalid literal format: " << literal << std::endl;
		exit(1);
	}

	return std::stoll(numStr);
}

// Helper: Check if a value is a multiple of a constraint
bool TypeChecker::isMultiple(long long value, const std::string &constraintLiteral)
{
	long long constraint = extractLiteralValue(constraintLiteral);
	if (constraint == 0)
	{
		std::cerr << "Error: Multiple-of constraint cannot be zero" << std::endl;
		exit(1);
	}
	return (value % constraint) == 0;
}

// Helper: Check if all constraints of valueType are satisfied by targetType
// E.g., I32*10I32 can be assigned to I32*5I32 because every multiple of 10 is a multiple of 5
bool TypeChecker::isMultipleOfCompatible(const std::string &valueType, const std::string &targetType)
{
	std::string valueBase, targetBase;
	std::vector<std::string> valueConstraints, targetConstraints;

	parseMultipleOfType(valueType, valueBase, valueConstraints);
	parseMultipleOfType(targetType, targetBase, targetConstraints);

	// Base types must match
	if (valueBase != targetBase)
	{
		return false;
	}

	// For each target constraint, check if value satisfies it
	for (const auto &targetConstraint : targetConstraints)
	{
		long long targetVal = extractLiteralValue(targetConstraint);

		// Check if any value constraint is a multiple of target constraint
		// E.g., if target is *5 and value is *10, then 10 % 5 == 0, so OK
		bool satisfied = false;
		for (const auto &valueConstraint : valueConstraints)
		{
			long long valueVal = extractLiteralValue(valueConstraint);
			if (valueVal % targetVal == 0)
			{
				satisfied = true;
				break;
			}
		}

		if (!satisfied)
		{
			return false;
		}
	}

	return true;
}

// Helper: Get base type from a multiple-of type
// E.g., "I32*5I32+I32*3I32" -> "I32"
std::string TypeChecker::getMultipleOfBaseType(const std::string &type)
{
	std::string baseType;
	std::vector<std::string> constraints;
	parseMultipleOfType(type, baseType, constraints);
	return baseType;
}

// Validate that an assignment to a multiple-of type satisfies the constraints
void TypeChecker::validateMultipleOfAssignment(const std::string &targetType, std::shared_ptr<ASTNode> valueNode)
{
	std::string baseType;
	std::vector<std::string> constraints;
	parseMultipleOfType(targetType, baseType, constraints);

	// Value must be a literal or another multiple-of type
	if (valueNode->type == ASTNodeType::LITERAL)
	{
		// Extract the value from the literal
		long long value = extractLiteralValue(valueNode->value);

		// Check each constraint
		for (const auto &constraint : constraints)
		{
			if (!isMultiple(value, constraint))
			{
				long long constraintVal = extractLiteralValue(constraint);
				std::cerr << "Error: Value " << value << " is not a multiple of " << constraintVal << std::endl;
				std::cerr << "       Required by type '" << targetType << "'" << std::endl;
				exit(1);
			}
		}
	}
	else if (isMultipleOfType(valueNode->inferredType))
	{
		// Assigning one multiple-of type to another - check compatibility
		if (!isMultipleOfCompatible(valueNode->inferredType, targetType))
		{
			std::cerr << "Error: Cannot assign type '" << valueNode->inferredType << "' to '" << targetType << "'" << std::endl;
			std::cerr << "       The multiple-of constraints are incompatible" << std::endl;
			exit(1);
		}
	}
	else
	{
		// Non-literal, non-multiple-of value - error
		std::cerr << "Error: Cannot assign non-literal value to multiple-of type '" << targetType << "'" << std::endl;
		std::cerr << "       Multiple-of constraints require compile-time constant values or compatible multiple-of types" << std::endl;
		exit(1);
	}
}

// Compute the result type of adding two types (handling multiple-of)
// E.g., (I32*5I32) + (I32*5I32) = I32*5I32
// E.g., (I32*5I32) + (I32*3I32) = I32*5I32+I32*3I32
std::string TypeChecker::computeMultipleOfAddition(const std::string &leftType, const std::string &rightType)
{
	// Get base types
	std::string leftBase = isMultipleOfType(leftType) ? getMultipleOfBaseType(leftType) : leftType;
	std::string rightBase = isMultipleOfType(rightType) ? getMultipleOfBaseType(rightType) : rightType;

	// Base types must match
	if (leftBase != rightBase)
	{
		// Fall back to the base type
		return leftBase;
	}

	// If both are the same multiple-of type, result is same
	if (leftType == rightType)
	{
		return leftType;
	}

	// If both are multiple-of types, create sum type
	if (isMultipleOfType(leftType) && isMultipleOfType(rightType))
	{
		return leftType + "+" + rightType;
	}

	// If only left is multiple-of, return it
	if (isMultipleOfType(leftType))
	{
		return leftType;
	}

	// If only right is multiple-of, return it
	if (isMultipleOfType(rightType))
	{
		return rightType;
	}

	// Neither is multiple-of, return base type
	return leftBase;
}
