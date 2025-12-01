#include "type_checker.h"
#include <iostream>

// Helper: Check if a type is an intersection type (contains '&' but not as reference)
bool TypeChecker::isIntersectionType(const std::string &type)
{
	// Make sure it's not a reference type like &I32 or &mut I32
	if (type.empty() || type[0] == '&')
		return false;
	return type.find('&') != std::string::npos;
}

// Helper: Split intersection type into its component types
std::vector<std::string> TypeChecker::splitIntersectionType(const std::string &intersectionType)
{
	std::vector<std::string> components;
	std::string current;
	for (char c : intersectionType)
	{
		if (c == '&')
		{
			components.push_back(current);
			current = "";
		}
		else
		{
			current += c;
		}
	}
	if (!current.empty())
	{
		components.push_back(current);
	}
	return components;
}

// Helper: Validate an intersection type and return merged field info
// Returns empty vector on error (error message already printed)
std::vector<std::pair<std::string, std::string>> TypeChecker::validateIntersectionType(const std::string &intersectionType)
{
	std::vector<std::pair<std::string, std::string>> mergedFields;
	std::map<std::string, std::string> fieldTypeMap; // field name -> type

	auto components = splitIntersectionType(intersectionType);

	for (const auto &component : components)
	{
		// Each component must be a struct type
		auto it = structTable.find(component);
		if (it == structTable.end())
		{
			std::cerr << "Error: Intersection type component '" << component
								<< "' is not a struct type" << std::endl;
			exit(1);
		}

		const StructInfo &structInfo = it->second;
		for (const auto &field : structInfo.fields)
		{
			const std::string &fieldName = field.first;
			const std::string &fieldType = field.second;

			// Check for field conflicts
			auto existing = fieldTypeMap.find(fieldName);
			if (existing != fieldTypeMap.end())
			{
				std::cerr << "Error: Intersection type has conflicting field '" << fieldName
									<< "' with types '" << existing->second << "' and '" << fieldType << "'" << std::endl;
				exit(1);
			}

			fieldTypeMap[fieldName] = fieldType;
			mergedFields.push_back({fieldName, fieldType});
		}
	}

	return mergedFields;
}

// Helper: Get the canonical name for an intersection type (used for struct generation)
std::string TypeChecker::getIntersectionStructName(const std::string &intersectionType)
{
	// Replace & with _AND_ for a valid identifier
	std::string result;
	for (char c : intersectionType)
	{
		if (c == '&')
		{
			result += "_AND_";
		}
		else
		{
			result += c;
		}
	}
	return result;
}
