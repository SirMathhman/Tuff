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
	// Convert "Type0<T>|Type1<T>" to "Union_Type0_Type1"
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
	
	// Detect if this is a generic union by checking if variants contain actual generic params (single letters like T, U)
	// vs concrete types (like I32, String, Point)
	std::set<std::string> genericParams;
	bool isGeneric = false;
	
	for (const auto &variant : variants)
	{
		size_t start = variant.find('<');
		if (start != std::string::npos)
		{
			size_t end = variant.find('>');
			if (end != std::string::npos)
			{
				std::string param = variant.substr(start + 1, end - start - 1);
				// Only treat single-letter uppercase params as generics (T, U, etc.)
				// Concrete types like I32, String, Point should not be treated as template params
				if (param.length() == 1 && param[0] >= 'A' && param[0] <= 'Z')
				{
					genericParams.insert(param);
					isGeneric = true;
				}
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
	
	// If generic, generate template
	if (isGeneric && genericParams.size() > 0)
	{
		ss << "template<";
		bool first = true;
		for (const auto &param : genericParams)
		{
			if (!first) ss << ", ";
			ss << "typename " << param;
			first = false;
		}
		ss << ">\n";
	}
	
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
		std::string fieldName = variant;
		size_t pos = fieldName.find('<');
		if (pos != std::string::npos)
		{
			fieldName = fieldName.substr(0, pos);
		}
		ss << "        " << mapType(variant) << " __val_" << fieldName << ";\n";
	}
	ss << "    };\n\n";

	// Constructor for each variant type
	for (const auto &variant : variants)
	{
		std::string fieldName = variant;
		size_t pos = fieldName.find('<');
		if (pos != std::string::npos)
		{
			fieldName = fieldName.substr(0, pos);
		}
		ss << "    " << structName << "(" << mapType(variant) << " val) : __tag(Tag::" << fieldName << "), __val_" << fieldName << "(val) {}\n";
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

	// Wrap the value using union constructor with template arguments
	std::string structName = getUnionStructName(targetType);
	
	// Extract generic parameters from target union type
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
				// If it's a concrete type (not a single-letter generic), add template args
				if (param.length() > 1 || param[0] < 'A' || param[0] > 'Z')
				{
					return structName + "<" + mapType(param) + ">(" + value + ")";
				}
			}
		}
	}
	
	return structName + "(" + value + ")";
}
