#include "type_checker.h"
#include <iostream>

// Expand type aliases recursively
// e.g., if MyInt = I32, then MyInt -> I32
// For generics: if Pair<T> = { first: T, second: T }, then Pair<I32> -> { first: I32, second: I32 }
std::string TypeChecker::expandTypeAlias(const std::string &type)
{
	// Check if this is a generic type instantiation like MyType<I32>
	size_t openBracket = type.find('<');
	std::string baseName = type;
	std::vector<std::string> typeArgs;

	if (openBracket != std::string::npos && type.back() == '>')
	{
		baseName = type.substr(0, openBracket);
		std::string argsStr = type.substr(openBracket + 1, type.length() - openBracket - 2);

		// Parse type arguments (handle nested generics)
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
				typeArgs.push_back(currentArg);
				currentArg = "";
			}
			else
			{
				if (c == ' ' && depth == 0 && currentArg.empty())
					continue;
				currentArg += c;
			}
		}
		if (!currentArg.empty())
			typeArgs.push_back(currentArg);
	}

	// Look up the type alias
	auto it = typeAliasTable.find(baseName);
	if (it == typeAliasTable.end())
	{
		// Not a type alias, return as-is
		return type;
	}

	const TypeAliasInfo &alias = it->second;
	std::string expandedType = alias.aliasedType;

	// If it's a generic alias, substitute type parameters
	if (!alias.genericParams.empty())
	{
		if (typeArgs.size() != alias.genericParams.size())
		{
			std::cerr << "Error: Type alias '" << baseName << "' expects "
								<< alias.genericParams.size() << " type arguments, got "
								<< typeArgs.size() << std::endl;
			exit(1);
		}

		// Substitute each generic parameter with the provided type argument
		for (size_t i = 0; i < alias.genericParams.size(); ++i)
		{
			const std::string &param = alias.genericParams[i];
			const std::string &arg = typeArgs[i];

			// Replace all occurrences of the parameter with the argument
			size_t pos = 0;
			while ((pos = expandedType.find(param, pos)) != std::string::npos)
			{
				// Make sure it's a whole word match (not part of another identifier)
				bool validStart = (pos == 0 || !std::isalnum(expandedType[pos - 1]));
				bool validEnd = (pos + param.length() >= expandedType.length() ||
												 !std::isalnum(expandedType[pos + param.length()]));

				if (validStart && validEnd)
				{
					expandedType.replace(pos, param.length(), arg);
					pos += arg.length();
				}
				else
				{
					pos += param.length();
				}
			}
		}
	}

	// Recursively expand in case the aliased type also contains aliases
	return expandTypeAlias(expandedType);
}
