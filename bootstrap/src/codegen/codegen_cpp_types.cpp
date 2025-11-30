#include "codegen_cpp.h"
#include <vector>

std::string CodeGeneratorCPP::mapType(std::string tuffType)
{
	if (tuffType == "I32")
		return "int32_t";
	if (tuffType == "Bool")
		return "bool";
	if (tuffType == "Void")
		return "void";

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
