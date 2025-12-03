#include "type_checker.h"
#include <iostream>

void TypeChecker::registerImplDecl(std::shared_ptr<ASTNode> child)
{
	// Resolve struct name (handle generics and FQN)
	std::string structName;
	if (child->typeNode)
	{
		structName = child->typeNode->value;
	}
	else
	{
		structName = child->value;
	}

	// If structName is not FQN, try to resolve it in current module or imports
	if (structName.find("::") == std::string::npos)
	{
		std::string fqn = currentModule + "::" + structName;
		if (structTable.find(fqn) != structTable.end() || typeAliasTable.find(fqn) != typeAliasTable.end())
		{
			structName = fqn;
		}
		else
		{
			// Try to find in imported modules
			bool found = false;
			for (const auto &mod : importedModules)
			{
				std::string modFqn = mod + "::" + structName;
				if (structTable.find(modFqn) != structTable.end() || typeAliasTable.find(modFqn) != typeAliasTable.end())
				{
					structName = modFqn;
					found = true;
					break;
				}
			}

			if (!found)
			{
				// Allow impl blocks for types that might be defined later or are built-in
				// But warn if it looks suspicious?
				// For now, just proceed, but maybe we should defer this check?
				// Actually, primitives like I32 are not in structTable, so we must allow them.
			}
		}
	}

	// Register all methods as functions with FQN: StructName::methodName
	for (auto method : child->children)
	{
		if (method->type != ASTNodeType::FUNCTION_DECL)
			continue;

		std::string methodName = method->value;
		std::string fqnMethodName = structName + "::" + methodName;

		if (functionTable.find(fqnMethodName) != functionTable.end())
		{
			std::cerr << "Error: Method '" << fqnMethodName << "' already declared." << std::endl;
			exit(1);
		}

		FunctionInfo info;
		// Copy generic params from method
		for (auto genParam : method->genericParams)
		{
			info.genericParams.push_back(genParam->value);
			if (!genParam->typeBound.empty())
			{
				info.genericBounds[genParam->value] = genParam->typeBound;
			}
		}
		// Also add generic params from impl block
		for (auto genParam : child->genericParams)
		{
			info.genericParams.push_back(genParam->value);
			if (!genParam->typeBound.empty())
			{
				info.genericBounds[genParam->value] = genParam->typeBound;
			}
			// Also add to AST node for CodeGen
			bool exists = false;
			for (const auto &existing : method->genericParams)
			{
				if (existing->value == genParam->value)
				{
					exists = true;
					break;
				}
			}
			if (!exists)
			{
				method->genericParams.push_back(genParam);
			}
		}
		for (const auto &lifetime : method->lifetimeParams)
		{
			info.lifetimeParams.push_back(lifetime);
		}
		info.returnType = method->inferredType;
		info.returnTypeExpr = resolveType(method->returnTypeNode);
		for (size_t i = 0; i < method->children.size() - 1; i++)
		{
			auto paramNode = method->children[i];
			info.params.push_back({paramNode->value, paramNode->inferredType});
			info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)});
		}

		// Update method node with FQN name for later code generation
		method->value = fqnMethodName;

		functionTable[fqnMethodName] = info;
	}
}
