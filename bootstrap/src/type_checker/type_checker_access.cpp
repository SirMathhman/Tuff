#include "type_checker.h"
#include <iostream>

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
			args.push_back(current);
			current = "";
			continue;
		}
		current += c;
	}
	if (!current.empty())
		args.push_back(current);
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
			std::cerr << "Error: Invalid array type '" << arrayType << "'." << std::endl;
			exit(1);
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
	check(operand);

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
					std::cerr << "Error: Cannot take mutable reference of immutable variable '" << name << "'." << std::endl;
					exit(1);
				}
			}
		}
	}
	else if (operand->type == ASTNodeType::FIELD_ACCESS)
	{
		// Borrowing a field borrows the whole struct
		auto base = operand->children[0];
		if (base->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = base->value;
			auto it = symbolTable.find(name);
			if (it != symbolTable.end())
			{
				if (node->isMutable)
				{
					if (!it->second.isMutable)
					{
						std::cerr << "Error: Cannot take mutable reference of field from immutable variable '" << name << "'." << std::endl;
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
