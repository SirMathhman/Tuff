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

// Helper: Check if a type is a union type (contains '|' but not a function pointer)
// Function pointer types start with '|' like: |I32, I32| => Bool
bool CodeGeneratorCPP::isUnionType(const std::string &type)
{
	// Function pointer types start with '|'
	if (!type.empty() && type[0] == '|')
		return false;
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
			// Trim whitespace
			while (!current.empty() && current.front() == ' ')
				current.erase(0, 1);
			while (!current.empty() && current.back() == ' ')
				current.pop_back();

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
		// Trim whitespace
		while (!current.empty() && current.front() == ' ')
			current.erase(0, 1);
		while (!current.empty() && current.back() == ' ')
			current.pop_back();

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

// Helper: Get the C++ tag enum name for a union type
std::string CodeGeneratorCPP::getUnionTagName(const std::string &unionType)
{
	// Convert "Some<I32>|None<I32>" or "Some<T>|None<T>" to "Tag_Some_None"
	std::string name = "Tag";
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

// Helper: Check if a type is a generic type parameter (e.g., "T" or "U")
// Generic params are single uppercase letters
bool CodeGeneratorCPP::isGenericParam(const std::string &type)
{
	if (type.length() == 1 && type[0] >= 'A' && type[0] <= 'Z')
		return true;
	return false;
}

// Helper: Generate a tagged union struct for a union type
std::string CodeGeneratorCPP::generateUnionStruct(const std::string &unionType, const std::vector<std::string> &typeParams)
{
	std::stringstream ss;
	auto variants = splitUnionType(unionType);

	// Check if any variant has generic syntax (contains '<' and '>')
	// If so, we need to generate a template
	bool hasGenerics = !typeParams.empty();
	if (!hasGenerics)
	{
		for (const auto &variant : variants)
		{
			if (variant.find('<') != std::string::npos)
			{
				hasGenerics = true;
				break;
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
	std::string tagName = "Tag_" + baseName;

	ss << "// Union type: " << unionType << "\n";

	// Generate standalone enum (no template needed)
	ss << "enum class " << tagName << " { ";
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
	ss << " };\n";

	// Only generate template if union has generic parameters
	if (hasGenerics)
	{
		if (!typeParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < typeParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << typeParams[i];
			}
			ss << ">\n";
		}
		else
		{
			// Fallback for legacy behavior (should be avoided)
			ss << "template<typename T>\n";
		}
	}

	ss << "struct " << structName << " {\n";
	ss << "    " << tagName << " __tag;\n";
	ss << "    union {\n";
	for (const auto &variant : variants)
	{
		std::string baseName = variant;
		std::string fullType = variant; // Full type with generics if present
		size_t pos = baseName.find('<');
		if (pos != std::string::npos)
		{
			baseName = baseName.substr(0, pos);
		}

		// For generics: use mapped type which handles parameter substitution
		if (hasGenerics)
		{
			// If we have explicit type params, we need to reconstruct the type with them
			// But mapType handles this if the variant string already contains the params (e.g. "Ok<T>")
			ss << "        " << mapType(fullType) << " __val_" << baseName << ";\n";
		}
		else
		{
			ss << "        " << mapType(fullType) << " __val_" << baseName << ";\n";
		}
	}
	ss << "    };\n\n";

	// Constructor for each variant type
	for (const auto &variant : variants)
	{
		std::string baseName = variant;
		std::string fullType = variant;
		size_t pos = baseName.find('<');
		if (pos != std::string::npos)
		{
			baseName = baseName.substr(0, pos);
		}

		ss << "    " << structName << "(" << mapType(fullType) << " val) : __tag(" << tagName << "::" << baseName << "), __val_" << baseName << "(val) {}\n";
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

	// Extract generic parameters and add as template arguments
	auto variants = splitUnionType(targetType);
	std::vector<std::string> templateArgs;

	for (const auto &variant : variants)
	{
		size_t start = variant.find('<');
		if (start != std::string::npos)
		{
			size_t end = variant.find('>');
			if (end != std::string::npos)
			{
				std::string param = variant.substr(start + 1, end - start - 1);
				// Add to template args if not already present
				bool found = false;
				for (const auto &arg : templateArgs)
				{
					if (arg == param)
					{
						found = true;
						break;
					}
				}
				if (!found)
				{
					templateArgs.push_back(param);
				}
			}
		}
	}

	if (!templateArgs.empty())
	{
		std::string result = structName + "<";
		for (size_t i = 0; i < templateArgs.size(); i++)
		{
			if (i > 0)
				result += ", ";
			result += mapType(templateArgs[i]);
		}
		result += ">(" + value + ")";
		return result;
	}

	return structName + "(" + value + ")";
}

// Generate a tagged union struct from a TypePtr (for type aliases)
std::string CodeGeneratorCPP::generateUnionStructFromType(const std::string &aliasName, ast::TypePtr unionType, const std::vector<std::string> &genericParams)
{
	if (!unionType || !std::holds_alternative<ast::UnionType>(*unionType))
		return "";
	
	const auto &ut = std::get<ast::UnionType>(*unionType);
	std::stringstream ss;
	
	// Generate tag enum (NOT templated - it's the same for all instantiations)
	std::string tagName = "Tag_" + aliasName;
	ss << "enum class " << tagName << " {\n";
	for (size_t i = 0; i < ut.members.size(); i++)
	{
		if (i > 0)
			ss << ",\n";
		// Extract base name from type (e.g., "Some" from "Some<T>")
		std::string memberName = genType(ut.members[i]);
		size_t pos = memberName.find('<');
		if (pos != std::string::npos)
			memberName = memberName.substr(0, pos);
		ss << "    " << memberName;
	}
	ss << "\n};\n\n";
	
	// Generate template header for the struct if needed
	if (!genericParams.empty())
	{
		ss << "template<";
		for (size_t i = 0; i < genericParams.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << "typename " << genericParams[i];
		}
		ss << ">\n";
	}
	
	// Generate the union struct
	ss << "struct " << aliasName << " {\n";
	ss << "    " << tagName << " __tag;\n";
	ss << "    union {\n";
	
	// Add a member for each variant
	for (size_t i = 0; i < ut.members.size(); i++)
	{
		std::string memberType = genType(ut.members[i]);
		std::string memberName = memberType;
		size_t pos = memberName.find('<');
		if (pos != std::string::npos)
			memberName = memberName.substr(0, pos);
		ss << "        " << memberType << " __" << memberName << ";\n";
	}
	
	ss << "    } __data;\n";
	ss << "};";
	
	return ss.str();
}
