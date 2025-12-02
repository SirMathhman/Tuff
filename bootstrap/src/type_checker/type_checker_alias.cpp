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

		// Validate type bounds
		for (size_t i = 0; i < alias.genericParams.size(); ++i)
		{
			const std::string &param = alias.genericParams[i];
			const std::string &arg = typeArgs[i];

			// Check if this parameter has a bound
			auto boundIt = alias.genericBounds.find(param);
			if (boundIt != alias.genericBounds.end())
			{
				const std::string &boundType = boundIt->second;

				// Skip validation if arg looks like a type parameter (single uppercase identifier)
				// or if it's in the current generic scope
				// (bounds will be validated when the outer generic is instantiated)
				bool looksLikeTypeParam = !arg.empty() && std::isupper(arg[0]) &&
																	arg.find('<') == std::string::npos &&
																	arg.find('[') == std::string::npos &&
																	arg.find('*') == std::string::npos;
				bool isInScope = std::find(genericParamsInScope.begin(),
																	 genericParamsInScope.end(),
																	 arg) != genericParamsInScope.end();

				if (!looksLikeTypeParam && !isInScope && arg != boundType)
				{
					std::cerr << "Error: Type parameter '" << param << "' in type alias '" << baseName
										<< "' requires type '" << boundType << "', but got '" << arg << "'" << std::endl;
					exit(1);
				}
			}
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

ExprPtr TypeChecker::expandTypeAlias(ExprPtr type)
{
	if (!type)
		return nullptr;

	if (type->kind == ExprKind::IDENTIFIER)
	{
		auto id = type->as<IdentifierExpr>();
		auto it = typeAliasTable.find(id->name);
		if (it != typeAliasTable.end())
		{
			// Found alias
			// If it has generic params, it should be a CallExpr.
			// If it is IdentifierExpr, it means no args provided.
			if (!it->second.genericParams.empty())
			{
				// Error: missing generic args
				// But maybe we are just resolving the name?
				// For now, assume if it's IdentifierExpr, it has no args.
			}

			return expandTypeAlias(it->second.aliasedTypeExpr);
		}
		return type;
	}

	if (type->kind == ExprKind::CALL)
	{
		auto c = type->as<CallExpr>();
		// Check if callee is an alias
		if (c->callee->kind == ExprKind::IDENTIFIER)
		{
			auto id = c->callee->as<IdentifierExpr>();
			auto it = typeAliasTable.find(id->name);
			if (it != typeAliasTable.end())
			{
				// Found generic alias
				// Substitute args
				std::map<std::string, ExprPtr> substitutions;
				if (c->args.size() != it->second.genericParams.size())
				{
					std::cerr << "Error: Type alias '" << id->name << "' expects "
										<< it->second.genericParams.size() << " type arguments, got "
										<< c->args.size() << std::endl;
					exit(1);
				}

				for (size_t i = 0; i < it->second.genericParams.size(); i++)
				{
					// Expand args first
					substitutions[it->second.genericParams[i]] = expandTypeAlias(c->args[i]);
				}

				ExprPtr expanded = substituteType(it->second.aliasedTypeExpr, substitutions);
				return expandTypeAlias(expanded);
			}
		}

		// Also expand args recursively
		std::vector<ExprPtr> newArgs;
		bool changed = false;
		for (auto arg : c->args)
		{
			auto newArg = expandTypeAlias(arg);
			if (newArg != arg)
				changed = true;
			newArgs.push_back(newArg);
		}
		if (changed)
		{
			return std::make_shared<CallExpr>(c->callee, newArgs, c->isGenericInstantiation);
		}
		return type;
	}

	// Handle other types recursively (pointers, arrays)
	if (type->kind == ExprKind::UNARY)
	{
		auto u = type->as<UnaryExpr>();
		auto newOp = expandTypeAlias(u->operand);
		if (newOp != u->operand)
			return std::make_shared<UnaryExpr>(u->op, newOp);
		return type;
	}

	if (type->kind == ExprKind::ARRAY)
	{
		auto a = type->as<ArrayExpr>();
		auto newElem = expandTypeAlias(a->elementType);
		if (newElem != a->elementType)
			return std::make_shared<ArrayExpr>(newElem, a->init, a->capacity);
		return type;
	}

	return type;
}
