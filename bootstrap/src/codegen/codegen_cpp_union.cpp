#include "codegen_cpp.h"
#include <sstream>
#include <set>

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
	// Convert "Type0|Type1|Type2" to "Union_Type0_Type1_Type2"
	std::string name = "Union";
	auto variants = splitUnionType(unionType);
	for (const auto &variant : variants)
	{
		name += "_" + variant;
	}
	return name;
}

// Helper: Generate a tagged union struct for a union type
std::string CodeGeneratorCPP::generateUnionStruct(const std::string &unionType)
{
	std::stringstream ss;
	auto variants = splitUnionType(unionType);
	std::string structName = getUnionStructName(unionType);

	ss << "// Union type: " << unionType << "\n";
	ss << "struct " << structName << " {\n";
	ss << "    enum class Tag { ";
	for (size_t i = 0; i < variants.size(); i++)
	{
		if (i > 0)
			ss << ", ";
		ss << variants[i];
	}
	ss << " };\n\n";

	ss << "    Tag __tag;\n";
	ss << "    union {\n";
	for (const auto &variant : variants)
	{
		ss << "        " << mapType(variant) << " __val_" << variant << ";\n";
	}
	ss << "    };\n\n";

	// Constructor for each variant type
	for (const auto &variant : variants)
	{
		ss << "    " << structName << "(" << mapType(variant) << " val) : __tag(Tag::" << variant << "), __val_" << variant << "(val) {}\n";
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

	// Wrap the value using union constructor
	std::string structName = getUnionStructName(targetType);
	return structName + "(" + value + ")";
}
