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
		else if (c == '~')
		{
			name += "_DTOR_";
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

	std::vector<std::pair<std::string, std::string>> allFields;
	std::string destructorName;
	std::vector<std::string> dataComponents;
	bool isPrimitiveWrapper = false;
	std::string primitiveType;

	// Primitive types that can be wrapped
	std::set<std::string> primitiveTypes = {"I32", "I64", "I16", "I8", "U32", "U64", "U16", "U8", "F32", "F64", "Bool"};

	// Collect all fields from all component structs
	for (const auto &component : components)
	{
		if (component.length() > 0 && component[0] == '~')
		{
			destructorName = component.substr(1);
			continue;
		}
		dataComponents.push_back(component);

		auto it = structFields.find(component);
		if (it != structFields.end())
		{
			for (const auto &field : it->second)
			{
				allFields.push_back(field);
			}
		}
		else if (primitiveTypes.count(component))
		{
			allFields.push_back({"value", component});
			isPrimitiveWrapper = true;
			primitiveType = component;
		}
	}

	// Generate field declarations
	for (const auto &field : allFields)
	{
		ss << "    " << mapType(field.second) << " " << field.first << ";\n";
	}

	ss << "\n";

	// For primitive wrappers, add constructor and conversion operator
	if (isPrimitiveWrapper && !primitiveType.empty())
	{
		std::string cppPrimType = mapType(primitiveType);
		// Constructor from primitive
		ss << "    " << structName << "(" << cppPrimType << " v) : value(v) {}\n";
		// Conversion operator to primitive
		ss << "    operator " << cppPrimType << "() const { return value; }\n\n";
	}
	else if (!destructorName.empty() && dataComponents.size() == 1)
	{
		// For struct wrappers with destructor, add constructor from the data struct
		std::string dataStructType = dataComponents[0];
		ss << "    " << structName << "(const " << dataStructType << "& src)";
		if (!allFields.empty())
		{
			ss << " : ";
			for (size_t i = 0; i < allFields.size(); ++i)
			{
				if (i > 0)
					ss << ", ";
				ss << allFields[i].first << "(src." << allFields[i].first << ")";
			}
		}
		ss << " {}\n\n";
	}

	// Generate Destructor
	if (!destructorName.empty())
	{
		ss << "    ~" << structName << "() {\n";

		// For primitive wrappers, just pass the value directly
		if (isPrimitiveWrapper)
		{
			ss << "        " << destructorName << "(this->value);\n";
		}
		else
		{
			// Reconstruct the data type
			std::string dataType;
			for (size_t i = 0; i < dataComponents.size(); ++i)
			{
				if (i > 0)
					dataType += "&";
				dataType += dataComponents[i];
			}

			std::string cppType = mapType(dataType);

			ss << "        " << cppType << " __temp = {";
			for (size_t i = 0; i < allFields.size(); ++i)
			{
				if (i > 0)
					ss << ", ";
				ss << "this->" << allFields[i].first;
			}
			ss << "};\n";

			ss << "        " << destructorName << "(__temp);\n";
		}
		ss << "    }\n\n";
	}

	// Generate static merge function
	ss << "    template<typename L, typename R>\n";
	ss << "    static " << structName << " merge(const L& __left, const R& __right) {\n";
	ss << "        " << structName << " __result;\n";

	// Track which fields come from which component
	std::set<std::string> usedFields;
	for (size_t i = 0; i < components.size(); i++)
	{
		if (components[i].length() > 0 && components[i][0] == '~')
			continue;

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
		else if (primitiveTypes.count(components[i]))
		{
			if (usedFields.find("value") == usedFields.end())
			{
				usedFields.insert("value");
				if (i == 0)
					ss << "        __result.value = __left.value;\n";
				else
					ss << "        __result.value = __right.value;\n";
			}
		}
	}

	ss << "        return __result;\n";
	ss << "    }\n";

	ss << "};\n";
	return ss.str();
}
