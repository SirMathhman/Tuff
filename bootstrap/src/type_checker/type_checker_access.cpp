#include "type_checker.h"
#include <iostream>

// Helper to trim whitespace from string
static std::string trim(const std::string &str)
{
	size_t start = str.find_first_not_of(" \t\n\r");
	if (start == std::string::npos)
		return "";
	size_t end = str.find_last_not_of(" \t\n\r");
	return str.substr(start, end - start + 1);
}

// Helper to parse generic type string
static void parseGenericType(const std::string &fullType, std::string &baseName, std::vector<std::string> &args)
{
	size_t start = fullType.find('<');
	if (start == std::string::npos)
	{
		baseName = fullType;
		return;
	}
	baseName = fullType.substr(0, start);

	std::string argsStr = fullType.substr(start + 1, fullType.length() - start - 2); // remove < and >

	int depth = 0;
	std::string current;
	for (char c : argsStr)
	{
		if (c == '<')
			depth++;
		else if (c == '>')
			depth--;
		else if (c == ',' && depth == 0)
		{
			args.push_back(trim(current));
			current = "";
			continue;
		}
		current += c;
	}
	if (!current.empty())
		args.push_back(trim(current));
}

void TypeChecker::checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node)
{
	auto object = node->children[0];
	check(object);

	std::string fieldName = node->value;
	std::string typeName = object->inferredType;

	// Handle pointer dereference for field access (auto-deref)
	if (typeName.length() > 0 && typeName[0] == '*')
	{
		// Strip pointer
		if (typeName.substr(0, 5) == "*mut ")
			typeName = typeName.substr(5);
		else
			typeName = typeName.substr(1);
	}

	// Handle pointer to slice: *[T] or *mut [T]
	// These have virtual fields: .init and .length (both USize)
	if (typeName.length() > 0 && typeName[0] == '[')
	{
		if (fieldName == "init" || fieldName == "length")
		{
			node->inferredType = "USize";
			return;
		}
	}

	if (object->type == ASTNodeType::IDENTIFIER)
	{
		auto enumIt = enumTable.find(object->value);
		if (enumIt != enumTable.end())
		{
			const EnumInfo &enumInfo = enumIt->second;
			bool found = false;
			for (const auto &variant : enumInfo.variants)
			{
				if (variant == fieldName)
				{
					found = true;
					break;
				}
			}
			if (!found)
			{
				std::cerr << "Error: Enum '" << object->value << "' has no variant named '" << fieldName << "'." << std::endl;
				exit(1);
			}
			node->type = ASTNodeType::ENUM_VALUE;
			node->inferredType = object->value;
			return;
		}
	}

	std::string baseName;
	std::vector<std::string> genericArgs;
	parseGenericType(typeName, baseName, genericArgs);

	auto it = structTable.find(baseName);
	if (it == structTable.end())
	{
		std::cerr << "Error: Cannot access field '" << fieldName << "' on non-struct type '" << typeName << "'." << std::endl;
		exit(1);
	}

	const StructInfo &info = it->second;

	// Create substitution map
	std::map<std::string, std::string> typeSubstitutions;
	if (genericArgs.size() == info.genericParams.size())
	{
		for (size_t i = 0; i < info.genericParams.size(); i++)
		{
			typeSubstitutions[info.genericParams[i]] = genericArgs[i];
		}
	}

	for (const auto &field : info.fields)
	{
		if (field.first == fieldName)
		{
			std::string fieldType = field.second;
			if (typeSubstitutions.count(fieldType))
			{
				fieldType = typeSubstitutions[fieldType];
			}
			node->inferredType = fieldType;
			return;
		}
	}

	std::cerr << "Error: Struct '" << typeName << "' has no field named '" << fieldName << "'." << std::endl;
	exit(1);
}

void TypeChecker::checkIndexExpr(std::shared_ptr<ASTNode> node)
{
	auto array = node->children[0];
	auto index = node->children[1];
	check(array);
	check(index);

	if (!isNumericType(index->inferredType))
	{
		std::cerr << "Error: Array index must be numeric, got " << index->inferredType << std::endl;
		exit(1);
	}

	std::string arrayType = array->inferredType;

	// Resolve type aliases
	auto aliasIt = typeAliasTable.find(arrayType);
	if (aliasIt != typeAliasTable.end())
	{
		arrayType = aliasIt->second.aliasedType;
	}
	// Handle generic aliases (e.g. Allocated<T>)
	else if (arrayType.find('<') != std::string::npos)
	{
		std::string baseName;
		std::vector<std::string> args;
		parseGenericType(arrayType, baseName, args);

		auto genericAliasIt = typeAliasTable.find(baseName);
		if (genericAliasIt != typeAliasTable.end())
		{
			// Substitute generic args into target type
			std::string target = genericAliasIt->second.aliasedType;
			const auto &params = genericAliasIt->second.genericParams;

			if (args.size() == params.size())
			{
				// Simple string substitution for now (fragile but works for simple cases)
				for (size_t i = 0; i < params.size(); i++)
				{
					std::string param = params[i];
					std::string arg = args[i];

					// Replace all occurrences of param with arg
					size_t pos = 0;
					while ((pos = target.find(param, pos)) != std::string::npos)
					{
						// Ensure we match whole word
						bool startOk = (pos == 0 || !isalnum(target[pos - 1]));
						bool endOk = (pos + param.length() == target.length() || !isalnum(target[pos + param.length()]));

						if (startOk && endOk)
						{
							target.replace(pos, param.length(), arg);
							pos += arg.length();
						}
						else
						{
							pos += param.length();
						}
					}
				}
				arrayType = target;
			}
		}
	}

	// Handle intersection types (take first component)
	// e.g. *mut [T] & #free -> *mut [T]
	size_t ampPos = arrayType.find('&');
	if (ampPos != std::string::npos)
	{
		// Be careful not to split inside generic args <...>
		int depth = 0;
		size_t splitPos = std::string::npos;
		for (size_t i = 0; i < arrayType.length(); i++)
		{
			if (arrayType[i] == '<')
				depth++;
			else if (arrayType[i] == '>')
				depth--;
			else if (arrayType[i] == '&' && depth == 0)
			{
				splitPos = i;
				break;
			}
		}

		if (splitPos != std::string::npos)
		{
			arrayType = arrayType.substr(0, splitPos);
			while (!arrayType.empty() && arrayType.back() == ' ')
				arrayType.pop_back();
		}
	}

	if (arrayType.length() > 0 && arrayType[0] == '*')
	{
		if (arrayType.substr(0, 5) == "*mut ")
			arrayType = arrayType.substr(5);
		else
			arrayType = arrayType.substr(1);
	}

	if (arrayType.length() > 0 && arrayType[0] == '[')
	{
		size_t semiPos = arrayType.find(';');
		if (semiPos != std::string::npos)
		{
			std::string elementType = arrayType.substr(1, semiPos - 1);
			while (!elementType.empty() && elementType.back() == ' ')
				elementType.pop_back();
			node->inferredType = elementType;
		}
		else
		{
			// Slice type [T]
			size_t endBracket = arrayType.find(']');
			if (endBracket != std::string::npos)
			{
				std::string elementType = arrayType.substr(1, endBracket - 1);
				node->inferredType = elementType;
			}
			else
			{
				std::cerr << "Error: Invalid array type '" << arrayType << "'." << std::endl;
				exit(1);
			}
		}
	}
	else
	{
		std::cerr << "Error: Cannot index non-array type '" << array->inferredType << "'." << std::endl;
		exit(1);
	}
}

void TypeChecker::checkReferenceExpr(std::shared_ptr<ASTNode> node)
{
	auto operand = node->children[0];

	// Check if this is a function reference: &funcName
	if (operand->type == ASTNodeType::IDENTIFIER)
	{
		std::string name = operand->value;

		// Check if it's a function name
		auto funcIt = functionTable.find(name);
		if (funcIt != functionTable.end())
		{
			// It's a function reference - create function pointer type
			const FunctionInfo &funcInfo = funcIt->second;

			// Build function pointer type string: |T1, T2| => Ret
			std::string fnPtrType = "|";
			for (size_t i = 0; i < funcInfo.params.size(); i++)
			{
				if (i > 0)
					fnPtrType += ", ";
				fnPtrType += funcInfo.params[i].second; // .second is the type
			}
			fnPtrType += "| => " + funcInfo.returnType;

			node->inferredType = fnPtrType;
			operand->inferredType = fnPtrType;
			return;
		}
	}

	check(operand);

	// Get the base variable being borrowed
	std::string baseVar = getBaseVariable(operand);
	BorrowKind borrowKind = node->isMutable ? BorrowKind::MUTABLE : BorrowKind::SHARED;

	// Check for borrow conflicts
	if (!baseVar.empty())
	{
		checkBorrowConflicts(baseVar, borrowKind, node->line);
	}

	// Track borrows for identifiers
	if (operand->type == ASTNodeType::IDENTIFIER)
	{
		std::string name = operand->value;
		auto it = symbolTable.find(name);
		if (it != symbolTable.end())
		{
			if (node->isMutable)
			{
				// Check mutability
				if (!it->second.isMutable)
				{
					std::cerr << "Error: Cannot take mutable reference of immutable variable '" << name << "' at line " << operand->line << "." << std::endl;
					exit(1);
				}
			}
		}
	}
	else if (operand->type == ASTNodeType::FIELD_ACCESS)
	{
		// Borrowing a field borrows the whole struct
		auto base = operand->children[0];

		// Check if base is a pointer (implicit dereference)
		bool isPointer = false;
		bool isMutablePointer = false;
		if (base->inferredType.length() > 0 && base->inferredType[0] == '*')
		{
			isPointer = true;
			if (base->inferredType.substr(0, 5) == "*mut ")
			{
				isMutablePointer = true;
			}
		}

		if (isPointer)
		{
			if (node->isMutable && !isMutablePointer)
			{
				std::cerr << "Error: Cannot take mutable reference of field through immutable pointer." << std::endl;
				exit(1);
			}
			// If it is a pointer, we don't care if the variable holding the pointer is mutable or not
			// We only care if the pointer itself allows mutation (*mut)
		}
		else if (base->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = base->value;
			auto it = symbolTable.find(name);
			if (it != symbolTable.end())
			{
				if (node->isMutable)
				{
					if (!it->second.isMutable)
					{
						std::cerr << "Error: Cannot take mutable reference of field from immutable variable '" << name << "' at line " << operand->line << "." << std::endl;
						exit(1);
					}
				}
			}
		}
	}

	if (node->isMutable)
	{
		node->inferredType = "*mut " + operand->inferredType;
	}
	else
	{
		node->inferredType = "*" + operand->inferredType;
	}
}

void TypeChecker::checkDerefExpr(std::shared_ptr<ASTNode> node)
{
	auto operand = node->children[0];
	check(operand);

	std::string ptrType = operand->inferredType;

	if (ptrType.length() > 0 && ptrType[0] == '*')
	{
		// Strip the pointer prefix, handling lifetimes
		std::string rest = ptrType.substr(1);

		// Check for lifetime annotation (lowercase letter followed by space)
		if (rest.length() >= 2 && rest[0] >= 'a' && rest[0] <= 'z' && rest[1] == ' ')
		{
			rest = rest.substr(2); // Skip lifetime and space
		}

		// Now handle mut
		if (rest.substr(0, 4) == "mut ")
			node->inferredType = rest.substr(4);
		else
			node->inferredType = rest;
	}
	else
	{
		std::cerr << "Error: Cannot dereference non-pointer type '" << ptrType << "'." << std::endl;
		exit(1);
	}
}
