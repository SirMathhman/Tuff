#include "codegen_cpp.h"
#include <vector>

std::string CodeGeneratorCPP::mapType(std::string tuffType)
{
	// Handle function pointer types: |T1, T2| => Ret -> Ret (*)(T1, T2)
	if (!tuffType.empty() && tuffType[0] == '|')
	{
		// Find the closing | and =>
		size_t closePos = 1;
		int depth = 0;
		while (closePos < tuffType.length())
		{
			if (tuffType[closePos] == '<')
				depth++;
			else if (tuffType[closePos] == '>')
				depth--;
			else if (tuffType[closePos] == '|' && depth == 0)
				break;
			closePos++;
		}

		// Extract param types string (between the two |)
		std::string paramsStr = tuffType.substr(1, closePos - 1);

		// Find => after the second |
		size_t arrowPos = tuffType.find("=>", closePos);
		if (arrowPos == std::string::npos)
		{
			return "/* invalid function pointer type */";
		}

		// Extract return type (after "=> ")
		std::string retType = tuffType.substr(arrowPos + 2);
		// Trim leading space
		while (!retType.empty() && retType[0] == ' ')
			retType = retType.substr(1);

		// Parse parameter types (comma-separated, respecting <> depth)
		std::vector<std::string> paramTypes;
		if (!paramsStr.empty())
		{
			depth = 0;
			std::string current;
			for (char c : paramsStr)
			{
				if (c == '<')
					depth++;
				else if (c == '>')
					depth--;
				else if (c == ',' && depth == 0)
				{
					// Trim whitespace
					while (!current.empty() && current[0] == ' ')
						current = current.substr(1);
					while (!current.empty() && current.back() == ' ')
						current.pop_back();
					if (!current.empty())
						paramTypes.push_back(current);
					current.clear();
					continue;
				}
				current += c;
			}
			// Last param
			while (!current.empty() && current[0] == ' ')
				current = current.substr(1);
			while (!current.empty() && current.back() == ' ')
				current.pop_back();
			if (!current.empty())
				paramTypes.push_back(current);
		}

		// Generate C++ function pointer: RetType (*)(Param1, Param2)
		std::string result = mapType(retType) + " (*)(";
		for (size_t i = 0; i < paramTypes.size(); i++)
		{
			if (i > 0)
				result += ", ";
			result += mapType(paramTypes[i]);
		}
		result += ")";
		return result;
	}

	// Handle intersection types: A & B -> mapType(A)
	// We assume the first component is the data type and subsequent components are markers (like #free)
	size_t ampPos = tuffType.find('&');
	if (ampPos != std::string::npos)
	{
		// Be careful not to split inside generic args <...>
		// Scan for & at top level
		int depth = 0;
		size_t splitPos = std::string::npos;
		for (size_t i = 0; i < tuffType.length(); i++)
		{
			if (tuffType[i] == '<')
				depth++;
			else if (tuffType[i] == '>')
				depth--;
			else if (tuffType[i] == '&' && depth == 0)
			{
				splitPos = i;
				break;
			}
		}

		if (splitPos != std::string::npos)
		{
			std::string left = tuffType.substr(0, splitPos);
			// Trim trailing whitespace
			while (!left.empty() && left.back() == ' ')
				left.pop_back();
			return mapType(left);
		}
	}

	// Handle union types: Some<I32>|None<I32> -> Union_Some_None<int32_t>
	if (tuffType.find('|') != std::string::npos)
	{
		std::string structName = getUnionStructName(tuffType);

		// Extract generic parameters from all variants and add as template arguments
		auto variants = splitUnionType(tuffType);
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
			result += ">";
			return result;
		}

		return structName;
	}

	if (tuffType == "I32")
		return "int32_t";
	if (tuffType == "I64")
		return "int64_t";
	if (tuffType == "I16")
		return "int16_t";
	if (tuffType == "I8")
		return "int8_t";
	if (tuffType == "U32")
		return "uint32_t";
	if (tuffType == "U64")
		return "uint64_t";
	if (tuffType == "U16")
		return "uint16_t";
	if (tuffType == "U8")
		return "uint8_t";
	if (tuffType == "F32")
		return "float";
	if (tuffType == "F64")
		return "double";
	if (tuffType == "Bool")
		return "bool";
	if (tuffType == "Void")
		return "void";
	if (tuffType == "USize")
		return "size_t";
	if (tuffType == "String")
		return "std::string";
	if (tuffType == "NativeString")
		return "const char*";
	if (tuffType == "string")
		return "const char*"; // Native C string, compatible with string_builtins.h

	if (tuffType.rfind("SizeOf<", 0) == 0)
		return "size_t";

	// Handle slice pointer types: *[T] or *mut [T] or *mut [T; init; cap]
	// These map to plain pointers in C++ (T* or const T*)
	if (tuffType.length() > 2 && tuffType[0] == '*')
	{
		size_t bracketPos = tuffType.find('[');
		if (bracketPos != std::string::npos && tuffType.back() == ']')
		{
			// Check if it's a sized array or slice
			size_t semiPos = tuffType.find(';');

			// It's an array pointer (slice or sized array)
			// Extract element type
			bool isMutable = (tuffType.substr(1, 4) == "mut ");
			size_t startPos = isMutable ? 6 : 2; // Skip "*mut [" or "*["

			std::string elementType;
			if (semiPos == std::string::npos)
			{
				// Slice: *[T]
				elementType = tuffType.substr(startPos, tuffType.length() - startPos - 1);
			}
			else
			{
				// Sized array: *[T; init; cap]
				// We just want T, so take substring up to semicolon
				elementType = tuffType.substr(startPos, semiPos - startPos);
			}

			if (isMutable)
			{
				return mapType(elementType) + "*";
			}
			else
			{
				return "const " + mapType(elementType) + "*";
			}
		}
	}

	// Handle pointer types: *T, *mut T, *a T, *a mut T
	if (!tuffType.empty() && tuffType[0] == '*')
	{
		// Strip lifetime annotation if present (e.g., "*a I32" -> "*I32", "*a mut I32" -> "*mut I32")
		// Lifetime is a single lowercase letter followed by space: *a T or *a mut T
		std::string stripped = tuffType;
		if (tuffType.length() > 2 && tuffType[1] >= 'a' && tuffType[1] <= 'z' && tuffType[2] == ' ')
		{
			// This is a lifetime: *a I32 or *a mut I32
			std::string rest = tuffType.substr(3); // Skip "*a "
			if (rest.substr(0, 4) == "mut ")
			{
				stripped = "*mut " + rest.substr(4);
			}
			else
			{
				stripped = "*" + rest;
			}
		}

		std::string pointeeType;
		bool isMutable = false;

		if (stripped.substr(0, 5) == "*mut ")
		{
			// *mut T -> pointer to mutable T
			pointeeType = stripped.substr(5);
			isMutable = true;
		}
		else
		{
			// *T -> pointer to const T
			pointeeType = stripped.substr(1);
			isMutable = false;
		}

		// Special case: if pointee is an array type [T; init; cap], extract element type
		// *mut [T; 0; L] -> T* (mutable pointer to T)
		// *[T; 0; L] -> const T* (immutable pointer to T)
		if (!pointeeType.empty() && pointeeType[0] == '[')
		{
			size_t firstSemi = pointeeType.find(';');
			if (firstSemi != std::string::npos)
			{
				std::string elementType = pointeeType.substr(1, firstSemi - 1);
				// Trim trailing whitespace
				while (!elementType.empty() && elementType.back() == ' ')
					elementType.pop_back();

				if (isMutable)
				{
					return mapType(elementType) + "*";
				}
				else
				{
					return "const " + mapType(elementType) + "*";
				}
			}
		}

		// Regular pointer to non-array type
		if (isMutable)
		{
			return mapType(pointeeType) + "*";
		}
		else
		{
			return "const " + mapType(pointeeType) + "*";
		}
	}

	// Handle array types: [T; init; capacity]
	if (!tuffType.empty() && tuffType[0] == '[')
	{
		// Parse: [T; init; capacity]
		size_t firstSemi = tuffType.find(';');
		if (firstSemi != std::string::npos)
		{
			std::string elementType = tuffType.substr(1, firstSemi - 1);
			// Trim trailing whitespace
			while (!elementType.empty() && elementType.back() == ' ')
				elementType.pop_back();

			// Find capacity (after second semicolon)
			size_t secondSemi = tuffType.find(';', firstSemi + 1);
			if (secondSemi != std::string::npos)
			{
				std::string capacityStr = tuffType.substr(secondSemi + 1);
				// Remove trailing ]
				if (!capacityStr.empty() && capacityStr.back() == ']')
					capacityStr.pop_back();
				// Trim whitespace
				while (!capacityStr.empty() && capacityStr.front() == ' ')
					capacityStr = capacityStr.substr(1);
				while (!capacityStr.empty() && capacityStr.back() == ' ')
					capacityStr.pop_back();

				return mapType(elementType) + "[" + capacityStr + "]";
			}
		}
	}

	// Check for generics
	size_t openBracket = tuffType.find('<');
	if (openBracket != std::string::npos && tuffType.back() == '>')
	{
		std::string baseType = tuffType.substr(0, openBracket);
		std::string argsStr = tuffType.substr(openBracket + 1, tuffType.length() - openBracket - 2);

		std::vector<std::string> args;
		int depth = 0;
		std::string currentArg;
		for (char c : argsStr)
		{
			if (c == '<')
				depth++;
			else if (c == '>')
				depth--;

			if (c == ',' && depth == 0)
			{
				args.push_back(currentArg);
				currentArg = "";
			}
			else
			{
				if (c == ' ' && depth == 0 && currentArg.empty())
					continue; // Skip leading spaces
				currentArg += c;
			}
		}
		if (!currentArg.empty())
			args.push_back(currentArg);

		std::string result = baseType + "<";
		for (size_t i = 0; i < args.size(); i++)
		{
			if (i > 0)
				result += ", ";
			result += mapType(args[i]);
		}
		result += ">";
		return result;
	}

	// Struct types pass through as-is
	return tuffType;
}

// Expand a type alias to its underlying type
// e.g., "Option<I32>" -> "Some<I32>|None<I32>"
std::string CodeGeneratorCPP::expandTypeAlias(const std::string &type)
{
	// Check if this is a generic type instantiation like Option<I32>
	size_t openBracket = type.find('<');
	std::string baseName = type;
	std::string typeArgs;

	if (openBracket != std::string::npos && type.back() == '>')
	{
		baseName = type.substr(0, openBracket);
		typeArgs = type.substr(openBracket); // includes "<...>"
	}

	// Look up the base name in our type alias map
	auto it = typeAliasExpansions.find(baseName);
	if (it == typeAliasExpansions.end())
	{
		// Not a type alias, return as-is
		return type;
	}

	std::string expandedType = it->second;

	// If we have type arguments, substitute them in the expanded type
	// e.g., "Some<T>|None<T>" with <I32> -> "Some<I32>|None<I32>"
	if (!typeArgs.empty())
	{
		// Extract the type argument (assuming single arg for now)
		std::string argType = typeArgs.substr(1, typeArgs.length() - 2); // strip < and >

		// Replace T with the actual type in the expanded union
		// Simple substitution: replace "<T>" with "<argType>"
		size_t pos = 0;
		while ((pos = expandedType.find("<T>", pos)) != std::string::npos)
		{
			expandedType.replace(pos, 3, "<" + argType + ">");
			pos += argType.length() + 2;
		}
	}

	return expandedType;
}
