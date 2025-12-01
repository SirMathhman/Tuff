#include "type_checker.h"

// Helper: Strip lifetime annotations from pointer types
// e.g., "*a I32" -> "*I32", "*a mut I32" -> "*mut I32"
static std::string stripLifetime(const std::string &type)
{
	if (type.empty() || type[0] != '*')
		return type;

	std::string rest = type.substr(1);

	// Check if there's a lifetime annotation (lowercase letter followed by space)
	if (rest.length() >= 2 && rest[0] >= 'a' && rest[0] <= 'z' && rest[1] == ' ')
	{
		// Skip the lifetime and space
		return "*" + rest.substr(2);
	}

	return type;
}

// Helper: Check if a type is a union type (contains '|')
bool TypeChecker::isUnionType(const std::string &type)
{
	return type.find('|') != std::string::npos;
}

// Helper: Split union type into its variants
std::vector<std::string> TypeChecker::splitUnionType(const std::string &unionType)
{
	std::vector<std::string> variants;
	std::string current;
	for (char c : unionType)
	{
		if (c == '|')
		{
			variants.push_back(current);
			current = "";
		}
		else
		{
			current += c;
		}
	}
	if (!current.empty())
	{
		variants.push_back(current);
	}
	return variants;
}

// Helper: Check if valueType is compatible with targetType (including union upcasting)
bool TypeChecker::isTypeCompatible(const std::string &valueType, const std::string &targetType)
{
	// Expand type aliases first
	std::string expandedValue = expandTypeAlias(valueType);
	std::string expandedTarget = expandTypeAlias(targetType);

	// Direct match
	if (expandedValue == expandedTarget)
		return true;

	// Strip lifetimes and compare again
	std::string strippedValue = stripLifetime(expandedValue);
	std::string strippedTarget = stripLifetime(expandedTarget);
	if (strippedValue == strippedTarget)
		return true;

	// Integer literal widening: I32 literals can be assigned to any integer type
	// This allows `let x: USize = 0;` to work
	if (expandedValue == "I32" &&
			(expandedTarget == "I8" || expandedTarget == "I16" || expandedTarget == "I32" || expandedTarget == "I64" ||
			 expandedTarget == "U8" || expandedTarget == "U16" || expandedTarget == "U32" || expandedTarget == "U64" ||
			 expandedTarget == "USize"))
	{
		return true;
	}

	// SizeOf<T> extends USize
	if (expandedTarget == "USize" && expandedValue.rfind("SizeOf<", 0) == 0)
	{
		return true;
	}

	// If target is a union type, check if value is one of the variants
	if (isUnionType(expandedTarget))
	{
		auto variants = splitUnionType(expandedTarget);
		for (const auto &variant : variants)
		{
			if (expandedValue == variant)
				return true;
		}
	}

	// Handle pointer mutability compatibility: *mut T is compatible with *T (immutable)
	if (expandedValue.length() > 5 && expandedValue.substr(0, 5) == "*mut " &&
			expandedTarget.length() > 1 && expandedTarget[0] == '*' && expandedTarget.substr(0, 5) != "*mut ")
	{
		// Value is *mut T, Target is *T
		std::string valueInner = expandedValue.substr(5);
		std::string targetInner = expandedTarget.substr(1);

		// Check if inner types are compatible
		if (isTypeCompatible(valueInner, targetInner))
			return true;
	}

	return false;
}
