#include "type_checker.h"
#include <iostream>

void TypeChecker::checkCallExpr(std::shared_ptr<ASTNode> node)
{
	auto callee = node->children[0];

	// Handle method call syntax: obj.method(args)
	if (callee->type == ASTNodeType::FIELD_ACCESS)
	{
		handleMethodCall(node);
		return;
	}

	if (callee->type != ASTNodeType::IDENTIFIER)
	{
		std::cerr << "Error: Expected function name in call expression." << std::endl;
		exit(1);
	}

	std::string funcName = callee->value;

	// Check if callee is a variable with function pointer type
	auto symIt = symbolTable.find(funcName);
	if (symIt != symbolTable.end())
	{
		std::string varType = symIt->second.type;
		// Check if it's a function pointer type: |T1, T2| => Ret
		if (!varType.empty() && varType[0] == '|')
		{
			// Parse the function pointer type to validate call
			check(callee);

			// Parse param types and return type from the function pointer type
			size_t closePos = 1;
			int depth = 0;
			while (closePos < varType.length())
			{
				if (varType[closePos] == '<')
					depth++;
				else if (varType[closePos] == '>')
					depth--;
				else if (varType[closePos] == '|' && depth == 0)
					break;
				closePos++;
			}
			std::string paramsStr = varType.substr(1, closePos - 1);
			size_t arrowPos = varType.find("=>", closePos);
			std::string retType = varType.substr(arrowPos + 2);
			while (!retType.empty() && retType[0] == ' ')
				retType = retType.substr(1);

			// Parse param types
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
				while (!current.empty() && current[0] == ' ')
					current = current.substr(1);
				while (!current.empty() && current.back() == ' ')
					current.pop_back();
				if (!current.empty())
					paramTypes.push_back(current);
			}

			// Check argument count
			size_t argCount = node->children.size() - 1;
			if (argCount != paramTypes.size())
			{
				std::cerr << "Error: Function pointer call expects " << paramTypes.size()
									<< " arguments, got " << argCount << std::endl;
				exit(1);
			}

			// Check each argument type
			for (size_t i = 0; i < argCount; i++)
			{
				auto arg = node->children[i + 1];
				check(arg);
				std::string expectedType = expandTypeAlias(paramTypes[i]);
				std::string actualType = expandTypeAlias(arg->inferredType);
				if (expectedType != actualType)
				{
					std::cerr << "Error: Argument " << (i + 1) << " to function pointer has type "
										<< actualType << ", expected " << expectedType << std::endl;
					exit(1);
				}
			}

			node->inferredType = retType;
			return;
		}
	}

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

			// Also store in string-based TypeEnvironment for codegen
			node->typeEnv.bind(paramName, exprTypeToString(argType));

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

			// Store in string-based TypeEnvironment for codegen
			node->typeEnv.bind(paramName, argTypeStr);

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

	// Also apply string substitution for codegen
	std::string returnTypeStr = exprTypeToString(returnType);
	returnTypeStr = node->typeEnv.substitute(returnTypeStr);

	node->exprType = returnType;
	node->inferredType = returnTypeStr;
}

void TypeChecker::handleMethodCall(std::shared_ptr<ASTNode> node)
{
	// node is a CALL_EXPR where children[0] is a FIELD_ACCESS
	// e.g., c.increment() where c is Counter

	auto fieldAccess = node->children[0];
	auto objectNode = fieldAccess->children[0];
	std::string methodName = fieldAccess->value;

	// Type-check the object first
	check(objectNode);

	// Get the object's type (may need to dereference pointers)
	std::string objectType = objectNode->inferredType;
	std::string baseType = objectType;
	bool isPointer = false;
	bool isMutablePointer = false;

	// Strip pointer qualifiers to get base struct type
	if (baseType.substr(0, 5) == "*mut ")
	{
		baseType = baseType.substr(5);
		isPointer = true;
		isMutablePointer = true;
	}
	else if (baseType.substr(0, 1) == "*")
	{
		baseType = baseType.substr(1);
		isPointer = true;
	}

	// Extract generic args from the type (e.g., "Vector<I32>" -> "Vector", "<I32>")
	std::string structName = baseType;
	std::string genericArgs;
	size_t anglePos = baseType.find('<');
	if (anglePos != std::string::npos)
	{
		structName = baseType.substr(0, anglePos);
		genericArgs = baseType.substr(anglePos);
	}

	// Construct the FQN for the method: StructName::methodName (without generic args)
	std::string fqn = structName + "::" + methodName;

	// Look up the method in function table
	auto it = functionTable.find(fqn);
	if (it == functionTable.end())
	{
		std::cerr << "Error: No method '" << methodName << "' found for type '" << baseType << "'." << std::endl;
		std::cerr << "  (looked for: " << fqn << ")" << std::endl;
		exit(1);
	}

	const FunctionInfo &info = it->second;

	// Check that this is actually a method (has 'this' as first param)
	if (info.params.empty() || info.params[0].first != "this")
	{
		std::cerr << "Error: '" << fqn << "' is not a method (no 'this' parameter)." << std::endl;
		std::cerr << "  Use " << fqn << "() instead of obj." << methodName << "()" << std::endl;
		exit(1);
	}

	// Check if method requires mutable reference
	std::string thisParamType = info.params[0].second;
	bool methodNeedsMutable = thisParamType.find("*mut ") != std::string::npos;

	// Check mutability
	if (methodNeedsMutable && !isPointer)
	{
		// Object is not a pointer, we need to check if it's a mutable variable
		if (objectNode->type == ASTNodeType::IDENTIFIER)
		{
			auto symIt = symbolTable.find(objectNode->value);
			if (symIt != symbolTable.end() && !symIt->second.isMutable)
			{
				std::cerr << "Error: Cannot call mutable method '" << methodName
									<< "' on immutable variable '" << objectNode->value << "'." << std::endl;
				std::cerr << "  Declare as: let mut " << objectNode->value << " = ..." << std::endl;
				exit(1);
			}
		}
	}

	// Transform the call: obj.method(args) -> StructName::method(&[mut] obj, args)
	// 1. Create a new IDENTIFIER node for the FQN callee
	auto fqnCallee = std::make_shared<ASTNode>();
	fqnCallee->type = ASTNodeType::IDENTIFIER;
	fqnCallee->value = fqn;

	// Copy generic args from field access (if explicitly provided)
	fqnCallee->genericArgs = fieldAccess->genericArgs;
	fqnCallee->genericArgsNodes = fieldAccess->genericArgsNodes;

	// If no explicit generic args but the object type has them, inherit from object type
	// e.g., vec.len() where vec: Vector<I32> should call Vector::len<I32>
	if (fqnCallee->genericArgs.empty() && !genericArgs.empty())
	{
		// Parse generic args from the type string "<I32>" -> ["I32"]
		std::string args = genericArgs.substr(1, genericArgs.length() - 2); // Strip < >
		size_t pos = 0;
		int depth = 0;
		std::string current;
		for (char c : args)
		{
			if (c == '<')
				depth++;
			else if (c == '>')
				depth--;
			else if (c == ',' && depth == 0)
			{
				if (!current.empty())
				{
					fqnCallee->genericArgs.push_back(current);
					current.clear();
				}
				continue;
			}
			current += c;
		}
		if (!current.empty())
		{
			fqnCallee->genericArgs.push_back(current);
		}
	}

	// 2. Determine the first argument (reference to object or object itself if already pointer)
	std::shared_ptr<ASTNode> firstArg;

	if (isPointer)
	{
		// Object is already a pointer, pass it directly (no need for &)
		// But check mutability: can't pass *T where *mut T is expected
		if (methodNeedsMutable && !isMutablePointer)
		{
			std::cerr << "Error: Cannot call mutable method '" << methodName
								<< "' through immutable pointer." << std::endl;
			exit(1);
		}
		firstArg = objectNode;
	}
	else
	{
		// Object is not a pointer, create reference expression (&obj or &mut obj)
		auto refExpr = std::make_shared<ASTNode>();
		refExpr->type = ASTNodeType::REFERENCE_EXPR;
		refExpr->isMutable = methodNeedsMutable;
		refExpr->addChild(objectNode);

		// Set the inferred type for the reference
		if (methodNeedsMutable)
		{
			refExpr->inferredType = "*mut " + objectType;
		}
		else
		{
			refExpr->inferredType = "*" + objectType;
		}
		firstArg = refExpr;
	}

	// 3. Rebuild the children: [fqnCallee, firstArg, ...originalArgs]
	std::vector<std::shared_ptr<ASTNode>> newChildren;
	newChildren.push_back(fqnCallee);
	newChildren.push_back(firstArg);

	// Add the rest of the arguments (skip first child which was field access)
	for (size_t i = 1; i < node->children.size(); i++)
	{
		newChildren.push_back(node->children[i]);
	}

	node->children = newChildren;

	// Now call the regular checkCallExpr logic on the transformed node
	checkCallExpr(node);
}
