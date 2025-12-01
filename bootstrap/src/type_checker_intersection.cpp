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
	int destructorCount = 0;
	std::vector<std::string> dataComponents;

	// Primitive types that can be used with destructors
	std::set<std::string> primitiveTypes = {"I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "F32", "F64", "Bool"};

	for (const auto &component : components)
	{
		// Check for destructor component (~DestructorName)
		if (!component.empty() && component[0] == '~')
		{
			destructorCount++;
			if (destructorCount > 1)
			{
				std::cerr << "Error: Intersection type can only have one destructor, found multiple." << std::endl;
				exit(1);
			}

			std::string destructorName = component.substr(1);
			auto it = functionTable.find(destructorName);
			if (it == functionTable.end())
			{
				std::cerr << "Error: Destructor function '" << destructorName << "' not found." << std::endl;
				exit(1);
			}

			// We'll validate the signature after we find the data components
			continue;
		}

		// Check if it's a primitive type
		if (primitiveTypes.count(component))
		{
			dataComponents.push_back(component);
			continue;
		}

		// Each non-destructor non-primitive component must be a struct type
		auto it = structTable.find(component);
		if (it == structTable.end())
		{
			std::cerr << "Error: Intersection type component '" << component
								<< "' is not a struct type or primitive type" << std::endl;
			exit(1);
		}

		dataComponents.push_back(component);

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

	// Validate destructor signature if present
	if (destructorCount > 0)
	{
		for (const auto &component : components)
		{
			if (!component.empty() && component[0] == '~')
			{
				std::string destructorName = component.substr(1);
				const FunctionInfo &funcInfo = functionTable[destructorName];

				if (funcInfo.params.size() != 1)
				{
					std::cerr << "Error: Destructor '" << destructorName << "' must take exactly one argument." << std::endl;
					exit(1);
				}

				// The argument type must match the data type being destructed
				std::string paramType = funcInfo.params[0].second;

				bool matchFound = false;
				for (const auto &comp : dataComponents)
				{
					if (comp == paramType)
					{
						matchFound = true;
						break;
					}
				}

				if (!matchFound)
				{
					std::cerr << "Error: Destructor '" << destructorName << "' expects '" << paramType
										<< "' but is not attached to that type in the intersection." << std::endl;
					exit(1);
				}

				if (funcInfo.returnType != "Void")
				{
					std::cerr << "Error: Destructor '" << destructorName << "' must return Void." << std::endl;
					exit(1);
				}
			}
		}
	}

	return mergedFields;
}

// Helper: Get the canonical name for an intersection type (used for struct generation)
std::string TypeChecker::getIntersectionStructName(const std::string &intersectionType)
{
	// Replace & with _AND_ and ~ with _DTOR_ for a valid identifier
	std::string result;
	for (char c : intersectionType)
	{
		if (c == '&')
		{
			result += "_AND_";
		}
		else if (c == '~')
		{
			result += "_DTOR_";
		}
		else
		{
			result += c;
		}
	}
	return result;
}
