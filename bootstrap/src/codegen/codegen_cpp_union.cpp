#include "codegen_cpp.h"
#include <sstream>
#include <set>
#include <functional>
#include <cctype>

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
	// SizeOf<T> is not a union type even if T contains '|'
	if (type.rfind("SizeOf<", 0) == 0)
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
	std::string guardName = "GUARD_" + structName;

	ss << "// Union type: " << unionType << "\n";
	ss << "#ifndef " << guardName << "\n";
	ss << "#define " << guardName << "\n";

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
			// Extract generic params from variants
			std::vector<std::string> extractedParams;
			std::set<std::string> seenParams;

			for (const auto &variant : variants)
			{
				for (size_t i = 0; i < variant.length(); i++)
				{
					if (isupper(variant[i]))
					{
						// Check if it's a standalone identifier (single uppercase letter)
						bool startOk = (i == 0) || (!isalnum(variant[i - 1]) && variant[i - 1] != '_');
						bool endOk = (i + 1 == variant.length()) || (!isalnum(variant[i + 1]) && variant[i + 1] != '_');

						if (startOk && endOk)
						{
							std::string param(1, variant[i]);
							if (seenParams.find(param) == seenParams.end())
							{
								seenParams.insert(param);
								extractedParams.push_back(param);
							}
						}
					}
				}
			}

			if (!extractedParams.empty())
			{
				ss << "template<";
				for (size_t i = 0; i < extractedParams.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << "typename " << extractedParams[i];
				}
				ss << ">\n";
			}
			else
			{
				// Fallback if no params found but hasGenerics is true (unlikely but safe default)
				ss << "template<typename T>\n";
			}
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
	ss << "#endif // " << guardName << "\n";
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

	// Get the underlying union type string to find its tag name
	// We need to generate the type string for the union (e.g. "Some<T>|None<T>")
	// Note: genType returns C++ types (Union_...), so we must reconstruct Tuff types
	std::stringstream unionStrSS;

	std::function<std::string(ast::TypePtr)> toTuffType;
	toTuffType = [&](ast::TypePtr t) -> std::string
	{
		if (!t)
			return "Void";
		if (auto p = std::get_if<ast::PrimitiveType>(&*t))
			return p->name;
		if (auto n = std::get_if<ast::NamedType>(&*t))
		{
			std::string s = n->name;
			if (!n->genericArgs.empty())
			{
				s += "<";
				for (size_t k = 0; k < n->genericArgs.size(); ++k)
				{
					if (k > 0)
						s += ", ";
					s += toTuffType(n->genericArgs[k]);
				}
				s += ">";
			}
			return s;
		}
		// Fallback for other types
		return genType(t);
	};

	for (size_t i = 0; i < ut.members.size(); i++)
	{
		if (i > 0)
			unionStrSS << "|";
		unionStrSS << toTuffType(ut.members[i]);
	}
	std::string unionTypeStr = unionStrSS.str();
	std::string underlyingTagName = getUnionTagName(unionTypeStr);

	// Generate tag alias instead of new enum
	std::string tagName = "Tag_" + aliasName;
	ss << "using " << tagName << " = " << underlyingTagName << ";\n\n";

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
		ss << "        " << memberType << " __val_" << memberName << ";\n";
	}

	ss << "    };\n\n";

	// Add constructors for each variant type
	for (size_t i = 0; i < ut.members.size(); i++)
	{
		std::string memberType = genType(ut.members[i]);
		std::string memberName = memberType;
		size_t pos = memberName.find('<');
		if (pos != std::string::npos)
			memberName = memberName.substr(0, pos);
		ss << "    " << aliasName << "(" << memberType << " val) : __tag(" << tagName << "::" << memberName << "), __val_" << memberName << "(val) {}\n";
	}

	ss << "};";

	return ss.str();
}
