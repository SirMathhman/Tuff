#include "type_checker.h"
#include <iostream>

void TypeChecker::checkStructLiteral(std::shared_ptr<ASTNode> node)
{
	std::string structName = node->value;

	// Check if struct type exists
	auto it = structTable.find(structName);
	if (it == structTable.end())
	{
		// Try FQN resolution if in module
		if (!currentModule.empty())
		{
			std::string fqn = currentModule + "::" + structName;
			it = structTable.find(fqn);
			if (it != structTable.end())
			{
				structName = fqn;
				node->value = fqn;
			}
		}

		// Try imported modules
		if (it == structTable.end())
		{
			for (const auto &imported : importedModules)
			{
				std::string fqn = imported + "::" + structName;
				it = structTable.find(fqn);
				if (it != structTable.end())
				{
					structName = fqn;
					node->value = fqn;
					break;
				}
			}
		}
	}

	if (it == structTable.end())
	{
		std::cerr << "Error: Unknown struct type '" << structName << "'." << std::endl;
		exit(1);
	}

	const StructInfo &info = it->second;

	// Check generic args
	if (node->genericArgs.size() != info.genericParams.size())
	{
		std::cerr << "Error: Struct '" << structName << "' expects " << info.genericParams.size()
							<< " generic arguments, got " << node->genericArgs.size() << std::endl;
		exit(1);
	}

	// Create substitution map
	std::map<std::string, std::string> typeSubstitutions;
	for (size_t i = 0; i < info.genericParams.size(); i++)
	{
		typeSubstitutions[info.genericParams[i]] = node->genericArgs[i];
	}

	// Check field count
	if (node->children.size() != info.fields.size())
	{
		std::cerr << "Error: Struct '" << structName << "' expects " << info.fields.size()
							<< " fields, got " << node->children.size() << std::endl;
		exit(1);
	}

	// Check field types in order
	for (size_t i = 0; i < node->children.size(); i++)
	{
		auto fieldExpr = node->children[i];
		check(fieldExpr);

		std::string expectedType = info.fields[i].second;
		if (typeSubstitutions.count(expectedType))
		{
			expectedType = typeSubstitutions[expectedType];
		}

		// Expand type aliases for both expected and actual types
		std::string expandedExpected = expandTypeAlias(expectedType);
		std::string expandedActual = expandTypeAlias(fieldExpr->inferredType);

		// Strip intersection from both types for comparison
		// e.g., "*mut [T] & #free" or "*mut [T]&#free" should match "*mut [T]"
		auto stripIntersection = [](std::string &type)
		{
			size_t ampPos = type.find(" & ");
			if (ampPos == std::string::npos)
			{
				ampPos = type.find("&");
				// Only strip if it looks like intersection (& followed by # or uppercase)
				if (ampPos != std::string::npos && ampPos + 1 < type.length())
				{
					char nextChar = type[ampPos + 1];
					if (nextChar != '#' && !std::isupper(nextChar))
					{
						return; // Not an intersection, don't strip
					}
				}
			}
			if (ampPos != std::string::npos)
			{
				type = type.substr(0, ampPos);
			}
		};

		stripIntersection(expandedExpected);
		stripIntersection(expandedActual);

		bool typesMatch = (expandedActual == expandedExpected);

		if (!typesMatch)
		{
			typesMatch = isTypeCompatible(expandedActual, expandedExpected);
		}

		if (!typesMatch)
		{
			std::cerr << "Error: Field " << (i + 1) << " of struct '" << structName
								<< "' expects type " << expectedType << ", got " << fieldExpr->inferredType << std::endl;
			std::cerr << "  (expanded: expected '" << expandedExpected << "', got '" << expandedActual << "')" << std::endl;
			exit(1);
		}
		node->fieldNames.push_back(info.fields[i].first);
	}

	// Construct full type name with generics
	std::string fullType = structName;
	if (!node->genericArgs.empty())
	{
		fullType += "<";
		for (size_t i = 0; i < node->genericArgs.size(); i++)
		{
			fullType += node->genericArgs[i];
			if (i < node->genericArgs.size() - 1)
				fullType += ",";
		}
		fullType += ">";
	}
	node->inferredType = fullType;
}

void TypeChecker::checkArrayLiteral(std::shared_ptr<ASTNode> node)
{
	if (node->children.empty())
	{
		std::cerr << "Error: Empty array literal requires explicit type annotation." << std::endl;
		exit(1);
	}

	check(node->children[0]);
	std::string elementType = node->children[0]->inferredType;

	for (size_t i = 1; i < node->children.size(); i++)
	{
		check(node->children[i]);
		if (node->children[i]->inferredType != elementType)
		{
			std::cerr << "Error: Array element " << (i + 1) << " has type "
								<< node->children[i]->inferredType << ", expected " << elementType << std::endl;
			exit(1);
		}
	}

	size_t count = node->children.size();
	node->inferredType = "[" + elementType + "; " + std::to_string(count) + "; " + std::to_string(count) + "]";
}
