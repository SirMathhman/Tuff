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

	// If target is an intersection type with a destructor, check if value matches the data type
	// e.g., I32 is compatible with I32&~myDestructor
	if (isIntersectionType(targetType))
	{
		auto components = splitIntersectionType(targetType);
		// Build the data type (exclude destructor components)
		std::string dataType;
		for (const auto &comp : components)
		{
			if (!comp.empty() && comp[0] == '~')
				continue;
			if (!dataType.empty())
				dataType += "&";
			dataType += comp;
		}
		if (valueType == dataType)
			return true;
	}

	// If value is an intersection type with a destructor, check if target matches the data type
	// e.g., I32&~myDestructor is compatible with I32 (can extract the underlying value)
	if (isIntersectionType(valueType))
	{
		auto components = splitIntersectionType(valueType);
		// Build the data type (exclude destructor components)
		std::string dataType;
		for (const auto &comp : components)
		{
			if (!comp.empty() && comp[0] == '~')
				continue;
			if (!dataType.empty())
				dataType += "&";
			dataType += comp;
		}
		if (targetType == dataType)
			return true;
	}

	return false;
}
