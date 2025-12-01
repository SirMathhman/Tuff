#include "codegen_cpp.h"
#include <sstream>
#include <set>

// Helper: Mangle a type name to be a valid C++ identifier
// Replaces <, >, |, &, *, and spaces with underscores
std::string CodeGeneratorCPP::mangleName(const std::string &name)
{
	std::string result;
	for (char c : name)
	{
		if (c == '<' || c == '>' || c == '|' || c == '&' || c == '*' || c == ' ' || c == ':')
		{
			result += '_';
		}
		else
		{
			result += c;
		}
	}
	return result;
}

// Helper: Check if a type is a union type (contains '|')
bool CodeGeneratorCPP::isUnionType(const std::string &type)
{
	return type.find('|') != std::string::npos;
}

// Helper: Split union type into its variants
std::vector<std::string> CodeGeneratorCPP::splitUnionType(const std::string &unionType)
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

// Helper: Get the C++ struct name for a union type
std::string CodeGeneratorCPP::getUnionStructName(const std::string &unionType)
{
	// Convert "Some<I32>|None<I32>" or "Some<T>|None<T>" to "Union_Some_None"
	// Extract base names without generic parameters
	std::string name = "Union";
	auto variants = splitUnionType(unionType);
	for (const auto &variant : variants)
	{
		size_t pos = variant.find('<');
		if (pos != std::string::npos)
		{
			name += "_" + variant.substr(0, pos);
		}
		else
		{
			name += "_" + variant;
		}
	}
	return name;
}

// Helper: Generate a tagged union struct for a union type
std::string CodeGeneratorCPP::generateUnionStruct(const std::string &unionType)
{
	std::stringstream ss;
	auto variants = splitUnionType(unionType);

	// Extract generic parameter(s) from the first variant
	std::set<std::string> genericParams;
	if (!variants.empty())
	{
		size_t start = variants[0].find('<');
		if (start != std::string::npos)
		{
			size_t end = variants[0].find('>');
			if (end != std::string::npos)
			{
				std::string param = variants[0].substr(start + 1, end - start - 1);
				genericParams.insert(param);
			}
		}
	}

	// Extract base name from variants (e.g., "Some" from "Some<T>" or "Some<I32>")
	std::string baseName;
	for (const auto &variant : variants)
	{
		size_t pos = variant.find('<');
		if (pos != std::string::npos)
		{
			baseName += variant.substr(0, pos);
		}
		else
		{
			baseName += variant;
		}
		baseName += "_";
	}
	baseName.pop_back(); // Remove trailing _

	std::string structName = "Union_" + baseName;

	ss << "// Union type: " << unionType << "\n";

	// Always generate as template (with T as the parameter name)
	ss << "template<typename T>\n";

	ss << "struct " << structName << " {\n";
	ss << "    enum class Tag { ";
	for (size_t i = 0; i < variants.size(); i++)
	{
		if (i > 0)
			ss << ", ";
		// Use base name without generics for enum values
		size_t pos = variants[i].find('<');
		if (pos != std::string::npos)
		{
			ss << variants[i].substr(0, pos);
		}
		else
		{
			ss << variants[i];
		}
	}
	ss << " };\n\n";

	ss << "    Tag __tag;\n";
	ss << "    union {\n";
	for (const auto &variant : variants)
	{
		std::string baseName = variant;
		size_t pos = baseName.find('<');
		if (pos != std::string::npos)
		{
			baseName = baseName.substr(0, pos);
		}
		// Use T as the generic parameter instead of the concrete type
		ss << "        " << baseName << "<T> __val_" << baseName << ";\n";
	}
	ss << "    };\n\n";

	// Constructor for each variant type
	for (const auto &variant : variants)
	{
		std::string baseName = variant;
		size_t pos = baseName.find('<');
		if (pos != std::string::npos)
		{
			baseName = baseName.substr(0, pos);
		}
		ss << "    " << structName << "(" << baseName << "<T> val) : __tag(Tag::" << baseName << "), __val_" << baseName << "(val) {}\n";
	}

	ss << "};\n";
	return ss.str();
}

// Helper: Wrap a value for union assignment
std::string CodeGeneratorCPP::wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType)
{
	// If target is not a union, no wrapping needed
	if (!isUnionType(targetType))
		return value;

	// If value type matches target exactly, no wrapping needed
	if (valueType == targetType)
		return value;

	// Wrap the value using union constructor with template argument
	std::string structName = getUnionStructName(targetType);
	
	// Extract generic parameter and add as template argument
	auto variants = splitUnionType(targetType);
	if (!variants.empty())
	{
		size_t start = variants[0].find('<');
		if (start != std::string::npos)
		{
			size_t end = variants[0].find('>');
			if (end != std::string::npos)
			{
				std::string param = variants[0].substr(start + 1, end - start - 1);
				return structName + "<" + mapType(param) + ">(" + value + ")";
			}
		}
	}
	
	return structName + "(" + value + ")";
}
