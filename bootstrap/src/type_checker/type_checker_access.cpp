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

	// Handle pointer to slice: *[T] or *mut [T]
	// These have virtual fields: .init and .length (both USize)
	if ((typeName.rfind("*[", 0) == 0 || typeName.rfind("*mut [", 0) == 0))
	{
		// Extract to check if it's a slice (no semicolons)
		size_t bracketStart = typeName.find('[');
		size_t bracketEnd = typeName.find(']');
		if (bracketStart != std::string::npos && bracketEnd != std::string::npos)
		{
			std::string arrayPart = typeName.substr(bracketStart, bracketEnd - bracketStart + 1);
			// Check if it's a slice [T] (no semicolons)
			if (arrayPart.find(';') == std::string::npos)
			{
				if (fieldName == "init" || fieldName == "length")
				{
					node->inferredType = "USize";
					return;
				}
				std::cerr << "Error: Slice pointer type '" << typeName << "' only has fields 'init' and 'length', not '" << fieldName << "'." << std::endl;
				exit(1);
			}
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

	// typeName already declared at top of function

	// Handle intersection types - look up field in all component structs
	if (isIntersectionType(typeName))
	{
		auto components = splitIntersectionType(typeName);
		for (const auto &component : components)
		{
			auto it = structTable.find(component);
			if (it != structTable.end())
			{
				for (const auto &field : it->second.fields)
				{
					if (field.first == fieldName)
					{
						node->inferredType = field.second;
						return;
					}
				}
			}
		}
		std::cerr << "Error: Intersection type '" << typeName << "' has no field named '" << fieldName << "'." << std::endl;
		exit(1);
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
			// Check if variable has been moved
			checkNotMoved(name);

			if (node->isMutable)
			{
				// Check mutability
				if (!it->second.isMutable)
				{
					std::cerr << "Error: Cannot take mutable reference of immutable variable '" << name << "'." << std::endl;
					exit(1);
				}
				// Check for borrow conflicts (need exclusive access)
				checkBorrowConflicts(name, true);
				// Record the borrow
				addBorrow(name, "_temp", true);
			}
			else
			{
				// Check for borrow conflicts (can coexist with other shared borrows)
				checkBorrowConflicts(name, false);
				// Record the borrow
				addBorrow(name, "_temp", false);
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
				checkNotMoved(name);
				if (node->isMutable)
				{
					if (!it->second.isMutable)
					{
						std::cerr << "Error: Cannot take mutable reference of field from immutable variable '" << name << "'." << std::endl;
						exit(1);
					}
					checkBorrowConflicts(name, true);
					addBorrow(name, "_temp", true);
				}
				else
				{
					checkBorrowConflicts(name, false);
					addBorrow(name, "_temp", false);
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
		// Formats: *T, *mut T, *a T, *a mut T
		std::string stripped = stripLifetime(ptrType); // Remove lifetime if present
		if (stripped.substr(0, 5) == "*mut ")
			node->inferredType = stripped.substr(5);
		else
			node->inferredType = stripped.substr(1);
	}
	else
	{
		std::cerr << "Error: Cannot dereference non-pointer type '" << ptrType << "'." << std::endl;
		exit(1);
	}
}
