#include "type_checker.h"
#include <iostream>

void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node)
{
	auto callee = node->children[0];
	if (callee->type != ASTNodeType::IDENTIFIER)
	{
		std::cerr << "Error: Expected function name in call expression." << std::endl;
		exit(1);
	}

	std::string funcName = callee->value;
	auto it = functionTable.find(funcName);
	if (it == functionTable.end())
	{
		// Try FQN resolution if in module
		if (!currentModule.empty())
		{
			std::string fqn = currentModule + "::" + funcName;
			it = functionTable.find(fqn);
		}

		// Try imported modules
		if (it == functionTable.end())
		{
			for (const auto &imported : importedModules)
			{
				std::string fqn = imported + "::" + funcName;
				it = functionTable.find(fqn);
				if (it != functionTable.end())
				{
					callee->value = fqn; // Update to FQN for codegen
					break;
				}
			}
		}

		if (it == functionTable.end())
		{
			std::cerr << "Error: Function '" << funcName << "' not declared." << std::endl;
			exit(1);
		}
	}

	const FunctionInfo &info = it->second;

	// Check generic args
	if (callee->genericArgs.size() != info.genericParams.size())
	{
		std::cerr << "Error: Function '" << funcName << "' expects " << info.genericParams.size()
							<< " generic arguments, got " << callee->genericArgs.size() << std::endl;
		std::cerr << "Syntax: " << funcName << "<";
		for (size_t i = 0; i < info.genericParams.size(); i++)
		{
			if (i > 0)
				std::cerr << ", ";
			std::cerr << "Type";
		}
		std::cerr << ">(...)" << std::endl;
		exit(1);
	}

	// Create substitution map
	std::map<std::string, std::string> typeSubstitutions;
	for (size_t i = 0; i < info.genericParams.size(); i++)
	{
		std::string paramName = info.genericParams[i];
		std::string argType = callee->genericArgs[i];
		typeSubstitutions[paramName] = argType;

		// Check type bounds if present
		auto boundIt = info.genericBounds.find(paramName);
		if (boundIt != info.genericBounds.end())
		{
			std::string boundType = boundIt->second;
			// Check if argType matches the bound
			if (argType != boundType)
			{
				std::cerr << "Error: Type parameter '" << paramName << "' requires type '" << boundType
									<< "', but got '" << argType << "'" << std::endl;
				exit(1);
			}
		}
	}

	size_t argCount = node->children.size() - 1;
	if (argCount != info.params.size())
	{
		std::cerr << "Error: Function '" << funcName << "' expects " << info.params.size()
							<< " arguments, got " << argCount << std::endl;
		exit(1);
	}

	for (size_t i = 0; i < argCount; i++)
	{
		auto arg = node->children[i + 1];
		check(arg);

		std::string expectedType = info.params[i].second;
		// Substitute generic types
		if (typeSubstitutions.count(expectedType))
		{
			expectedType = typeSubstitutions[expectedType];
		}

		// Use typesMatch for lifetime-aware comparison
		if (!typesMatch(arg->inferredType, expectedType, info.lifetimeParams))
		{
			std::cerr << "Error: Argument " << (i + 1) << " to function '" << funcName
								<< "' has type " << arg->inferredType << ", expected " << expectedType << std::endl;
			exit(1);
		}
	}

	std::string returnType = info.returnType;
	if (typeSubstitutions.count(returnType))
	{
		returnType = typeSubstitutions[returnType];
	}
	// Strip lifetime from return type for the inferred type at call site
	node->inferredType = stripLifetime(returnType);
}
