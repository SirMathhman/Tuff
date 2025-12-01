#include "codegen_cpp.h"
#include <vector>

std::string CodeGeneratorCPP::mapType(std::string tuffType)
{
	// Strip multiple-of constraints: I32*5I32 -> I32
	size_t starPos = tuffType.find('*');
	if (starPos != std::string::npos && starPos > 0)
	{
		// Check if it's a multiple-of type (not a pointer)
		if (starPos + 1 < tuffType.length() && tuffType[starPos + 1] >= '0' && tuffType[starPos + 1] <= '9')
		{
			tuffType = tuffType.substr(0, starPos);
		}
	}

	// Handle union types: I32|Bool -> Union_I32_Bool
	if (tuffType.find('|') != std::string::npos)
	{
		return getUnionStructName(tuffType);
	}

	// Handle intersection types: Point&Color -> Point_AND_Color
	// But NOT reference types like &I32
	if (!tuffType.empty() && tuffType[0] != '&' && tuffType.find('&') != std::string::npos)
	{
		return getIntersectionStructName(tuffType);
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

	if (tuffType.rfind("SizeOf<", 0) == 0)
		return "size_t";

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

		if (stripped.substr(0, 5) == "*mut ")
		{
			// *mut T -> pointer to mutable T
			return mapType(stripped.substr(5)) + "*";
		}
		// *T -> pointer to const T
		return "const " + mapType(stripped.substr(1)) + "*";
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
