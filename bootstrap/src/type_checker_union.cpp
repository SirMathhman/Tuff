#include "type_checker.h"

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
	// Direct match
	if (valueType == targetType)
		return true;

	// If target is a union type, check if value is one of the variants
	if (isUnionType(targetType))
	{
		auto variants = splitUnionType(targetType);
		for (const auto &variant : variants)
		{
			if (valueType == variant)
				return true;
		}
	}

	return false;
}
