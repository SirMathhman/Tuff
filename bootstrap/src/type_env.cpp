#include "include/type_env.h"
#include <sstream>
#include <iostream>
#include <cctype>

void TypeEnvironment::bind(const std::string &typeVar, const std::string &concreteType)
{
	substitutions[typeVar] = concreteType;
}

bool TypeEnvironment::isBound(const std::string &typeVar) const
{
	return substitutions.find(typeVar) != substitutions.end();
}

std::string TypeEnvironment::getBinding(const std::string &typeVar) const
{
	auto it = substitutions.find(typeVar);
	if (it != substitutions.end())
		return it->second;
	return "";
}

std::string TypeEnvironment::trim(const std::string &str)
{
	size_t start = 0;
	while (start < str.length() && std::isspace(str[start]))
		start++;
	size_t end = str.length();
	while (end > start && std::isspace(str[end - 1]))
		end--;
	return str.substr(start, end - start);
}

std::string TypeEnvironment::substituteCsv(const std::string &types) const
{
	// Handle comma-separated list: "T, U, I32" -> "I32, F64, I32"
	std::stringstream ss;
	std::stringstream input(types);
	std::string type;
	bool first = true;

	while (std::getline(input, type, ','))
	{
		if (!first)
			ss << ", ";
		ss << substitute(trim(type));
		first = false;
	}

	return ss.str();
}

std::string TypeEnvironment::substitute(const std::string &type) const
{
	if (type.empty())
		return type;

	// Handle simple identifier: "T" -> "I32"
	if (substitutions.find(type) != substitutions.end())
	{
		return substitutions.at(type);
	}

	// Handle generic types: "Vec<T>" -> "Vec<I32>"
	size_t ltPos = type.find('<');
	if (ltPos != std::string::npos)
	{
		size_t gtPos = type.rfind('>');
		if (gtPos != std::string::npos && gtPos > ltPos)
		{
			std::string base = type.substr(0, ltPos);
			std::string args = type.substr(ltPos + 1, gtPos - ltPos - 1);
			std::string suffix = type.substr(gtPos + 1);

			std::string substArgs = substituteCsv(args);
			return base + "<" + substArgs + ">" + suffix;
		}
	}

	// Handle union types: "Some<T>|None<T>" -> "Some<I32>|None<I32>"
	size_t pipePos = type.find('|');
	if (pipePos != std::string::npos)
	{
		// Make sure we're at top-level (not inside < >)
		int depth = 0;
		for (size_t i = 0; i < pipePos; i++)
		{
			if (type[i] == '<')
				depth++;
			else if (type[i] == '>')
				depth--;
		}

		if (depth == 0)
		{
			// Top-level pipe - split and substitute each variant
			std::stringstream ss;
			size_t lastPos = 0;
			depth = 0;

			for (size_t i = 0; i <= type.length(); i++)
			{
				if (i < type.length())
				{
					if (type[i] == '<')
						depth++;
					else if (type[i] == '>')
						depth--;
					else if (type[i] == '|' && depth == 0)
					{
						std::string variant = trim(type.substr(lastPos, i - lastPos));
						if (lastPos > 0)
							ss << "|";
						ss << substitute(variant);
						lastPos = i + 1;
					}
				}
				else if (i == type.length() && lastPos < type.length())
				{
					// Final variant
					std::string variant = trim(type.substr(lastPos));
					if (lastPos > 0)
						ss << "|";
					ss << substitute(variant);
				}
			}
			return ss.str();
		}
	}

	// Handle pointer types: "*T" -> "*I32", "*mut T" -> "*mut I32"
	if (!type.empty() && type[0] == '*')
	{
		size_t start = 1;
		if (type.substr(0, 5) == "*mut ")
		{
			std::string inner = substitute(type.substr(5));
			return "*mut " + inner;
		}
		else
		{
			std::string inner = substitute(type.substr(1));
			return "*" + inner;
		}
	}

	// Handle array types: "[T; init; cap]" -> "[I32; init; cap]"
	if (!type.empty() && type[0] == '[')
	{
		size_t semiPos = type.find(';');
		if (semiPos != std::string::npos)
		{
			std::string elemType = type.substr(1, semiPos - 1);
			std::string rest = type.substr(semiPos);
			return "[" + substitute(trim(elemType)) + rest;
		}
	}

	// No substitution needed
	return type;
}

TypeEnvironment TypeEnvironment::createChild() const
{
	TypeEnvironment child;
	child.substitutions = this->substitutions; // Copy bindings
	return child;
}

void TypeEnvironment::print() const
{
	std::cout << "TypeEnvironment bindings:\n";
	for (const auto &pair : substitutions)
	{
		std::cout << "  " << pair.first << " -> " << pair.second << "\n";
	}
}

