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

	// Mark if callee is extern (for codegen to skip template args)
	node->calleeIsExtern = info.isExtern;

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
	std::map<std::string, ExprPtr> typeSubstitutions;

	if (!callee->genericArgsNodes.empty())
	{
		if (callee->genericArgsNodes.size() != info.genericParams.size())
		{
			std::cerr << "Error: Function '" << funcName << "' expects " << info.genericParams.size()
								<< " generic arguments, got " << callee->genericArgsNodes.size() << std::endl;
			exit(1);
		}

		for (size_t i = 0; i < info.genericParams.size(); i++)
		{
			std::string paramName = info.genericParams[i];
			ExprPtr argType = resolveType(callee->genericArgsNodes[i]);
			typeSubstitutions[paramName] = argType;

			// Check type bounds if present
			auto boundIt = info.genericBoundsExpr.find(paramName);
			if (boundIt != info.genericBoundsExpr.end())
			{
				ExprPtr boundType = boundIt->second;
				// Substitute generic params in bound if needed (e.g. <T, U: T>)
				boundType = substituteType(boundType, typeSubstitutions);

				if (!isTypeCompatible(argType, boundType))
				{
					std::cerr << "Error: Type parameter '" << paramName << "' requires type '" << exprTypeToString(boundType)
										<< "', but got '" << exprTypeToString(argType) << "'" << std::endl;
					exit(1);
				}
			}
		}
	}
	else if (!callee->genericArgs.empty())
	{
		// Fallback for string generic args (deprecated)
		if (callee->genericArgs.size() != info.genericParams.size())
		{
			std::cerr << "Error: Function '" << funcName << "' expects " << info.genericParams.size()
								<< " generic arguments, got " << callee->genericArgs.size() << std::endl;
			exit(1);
		}

		for (size_t i = 0; i < info.genericParams.size(); i++)
		{
			std::string paramName = info.genericParams[i];
			std::string argTypeStr = callee->genericArgs[i];
			// Try to convert string to ExprPtr
			ExprPtr argType = std::make_shared<IdentifierExpr>(argTypeStr); // Simple fallback
			typeSubstitutions[paramName] = argType;
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

		ExprPtr expectedType = info.paramTypesExpr[i].second;
		// Substitute generic types
		expectedType = substituteType(expectedType, typeSubstitutions);

		// Use isTypeCompatible for type comparison
		if (arg->exprType && expectedType)
		{
			if (!isTypeCompatible(arg->exprType, expectedType))
			{
				std::cerr << "Error: Argument " << (i + 1) << " to function '" << funcName
									<< "' has type " << exprTypeToString(arg->exprType) << ", expected " << exprTypeToString(expectedType) << std::endl;
				exit(1);
			}
		}
		else
		{
			// Fallback to string check
			std::string expectedTypeStr = info.params[i].second;
			// We can't easily substitute strings if we only have ExprPtr map
			// But we can try to use inferredType string
			if (!isTypeCompatible(arg->inferredType, expectedTypeStr))
			{
				// This might be false positive if strings don't match but types do
				// But we should have exprType by now.
			}
		}
	}

	ExprPtr returnType = info.returnTypeExpr;
	returnType = substituteType(returnType, typeSubstitutions);
	node->exprType = returnType;
	node->inferredType = exprTypeToString(returnType);
}
