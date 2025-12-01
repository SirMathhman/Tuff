#include "codegen_cpp.h"
#include <sstream>
#include <set>
#include <map>

// Helper: Check if a type is an intersection type (contains '&' but not as reference prefix)
bool CodeGeneratorCPP::isIntersectionType(const std::string &type)
{
	if (type.empty() || type[0] == '&')
		return false;
	return type.find('&') != std::string::npos;
}

// Helper: Split intersection type into its component types
std::vector<std::string> CodeGeneratorCPP::splitIntersectionType(const std::string &intersectionType)
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

// Helper: Get the C++ struct name for an intersection type
std::string CodeGeneratorCPP::getIntersectionStructName(const std::string &intersectionType)
{
	// Convert "Type0&Type1" to "Type0_AND_Type1"
	std::string name;
	for (char c : intersectionType)
	{
		if (c == '&')
		{
			name += "_AND_";
		}
		else
		{
			name += c;
		}
	}
	return name;
}

// Helper: Generate a merged struct for an intersection type
std::string CodeGeneratorCPP::generateIntersectionStruct(
	const std::string &intersectionType,
	const std::map<std::string, std::vector<std::pair<std::string, std::string>>> &structFields)
{
	std::stringstream ss;
	auto components = splitIntersectionType(intersectionType);
	std::string structName = getIntersectionStructName(intersectionType);

	ss << "// Intersection type: " << intersectionType << "\n";
	ss << "struct " << structName << " {\n";

	// Collect all fields from all component structs
	std::vector<std::pair<std::string, std::string>> allFields;
	for (const auto &component : components)
	{
		auto it = structFields.find(component);
		if (it != structFields.end())
		{
			for (const auto &field : it->second)
			{
				allFields.push_back(field);
			}
		}
	}

	// Generate field declarations
	for (const auto &field : allFields)
	{
		ss << "    " << mapType(field.second) << " " << field.first << ";\n";
	}

	ss << "\n";

	// Generate static merge function
	ss << "    template<typename L, typename R>\n";
	ss << "    static " << structName << " merge(const L& __left, const R& __right) {\n";
	ss << "        " << structName << " __result;\n";

	// Track which fields come from which component
	std::set<std::string> usedFields;
	for (size_t i = 0; i < components.size(); i++)
	{
		auto it = structFields.find(components[i]);
		if (it != structFields.end())
		{
			for (const auto &field : it->second)
			{
				if (usedFields.find(field.first) == usedFields.end())
				{
					usedFields.insert(field.first);
					// Determine which source to use based on position
					if (i == 0)
					{
						ss << "        __result." << field.first << " = __left." << field.first << ";\n";
					}
					else
					{
						ss << "        __result." << field.first << " = __right." << field.first << ";\n";
					}
				}
			}
		}
	}

	ss << "        return __result;\n";
	ss << "    }\n";

	ss << "};\n";
	return ss.str();
}
