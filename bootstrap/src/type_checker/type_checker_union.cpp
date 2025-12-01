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
	// Expand type aliases first
	std::string expandedValue = expandTypeAlias(valueType);
	std::string expandedTarget = expandTypeAlias(targetType);

	// Direct match
	if (expandedValue == expandedTarget)
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

	// Multiple-of compatibility: I32*10I32 can be assigned to I32*5I32
	if (isMultipleOfType(expandedValue) && isMultipleOfType(expandedTarget))
	{
		if (isMultipleOfCompatible(expandedValue, expandedTarget))
			return true;
	}

	// Multiple-of to base type: I32*5I32 can be assigned to I32
	if (isMultipleOfType(expandedValue))
	{
		std::string baseType = getMultipleOfBaseType(expandedValue);
		if (baseType == expandedTarget)
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

	// If target is an intersection type with a destructor, check if value matches the data type
	// e.g., I32 is compatible with I32&~myDestructor
	if (isIntersectionType(expandedTarget))
	{
		auto components = splitIntersectionType(expandedTarget);
		// Build the data type (exclude destructor components)
		std::string dataType;
		for (const auto &comp : components)
		{
			if (!comp.empty() && comp[0] == '#')
				continue;
			if (!dataType.empty())
				dataType += "&";
			dataType += comp;
		}
		if (expandedValue == dataType)
			return true;
	}

	// If value is an intersection type with a destructor, check if target matches the data type
	// e.g., I32&#myDestructor is compatible with I32 (can extract the underlying value)
	if (isIntersectionType(expandedValue))
	{
		auto components = splitIntersectionType(expandedValue);
		// Build the data type (exclude destructor components)
		std::string dataType;
		for (const auto &comp : components)
		{
			if (!comp.empty() && comp[0] == '#')
				continue;
			if (!dataType.empty())
				dataType += "&";
			dataType += comp;
		}
		if (expandedTarget == dataType)
			return true;
			
		// Also check if target is compatible with the data type (e.g. *mut [T] vs *[T])
		if (isTypeCompatible(dataType, expandedTarget))
			return true;
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
