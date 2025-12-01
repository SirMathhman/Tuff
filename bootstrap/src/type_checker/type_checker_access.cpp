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

	// Handle pointer to slice: *[T] or *mut [T] or *mut [T; init; cap]
	// These have virtual fields: .init and .length (both USize)
	if ((typeName.rfind("*[", 0) == 0 || typeName.rfind("*mut [", 0) == 0))
	{
		// Extract to check if it's a slice (no semicolons)
		size_t bracketStart = typeName.find('[');
		size_t bracketEnd = typeName.find(']');
		
		// Check if it's a sized array or slice
		// Sized arrays also have .init and .length if they are pointers
		// Actually, sized arrays [T; N; C] have fixed size, but we might want to access it
		// But the error message "Cannot access field 'pointer' on non-struct type '*Slice<T>'"
		// suggests that *Slice<T> is NOT being recognized as a struct pointer.
		// Wait, *Slice<T> IS a pointer to a struct.
		// The issue is likely that typeName is "*Slice<T>" and we need to dereference it to get "Slice<T>"
		// But field access on pointer (*p).x is usually handled by auto-deref or explicit deref.
		// In Tuff, p.x works on pointers.
	}
	
	// Handle pointer dereference for field access (auto-deref)
	if (typeName.length() > 0 && typeName[0] == '*')
	{
		// Strip pointer
		if (typeName.substr(0, 5) == "*mut ")
			typeName = typeName.substr(5);
		else
			typeName = typeName.substr(1);
			
		// Strip lifetime if present: *a T -> T
		// Simple heuristic: if starts with lowercase letter and space
		if (typeName.length() > 2 && typeName[1] == ' ' && typeName[0] >= 'a' && typeName[0] <= 'z')
		{
			typeName = typeName.substr(2);
		}
	}

	// Handle intersection types (struct merging)
	if (isIntersectionType(typeName))
	{
		auto parts = splitIntersectionType(typeName);
		bool found = false;
		std::string fieldType;

		for (const auto &part : parts)
		{
			// Check if this part is a struct with the field
			auto it = structTable.find(part);
			if (it != structTable.end())
			{
				for (const auto &field : it->second.fields)
				{
					if (field.first == fieldName)
					{
						fieldType = field.second;
						found = true;
						break;
					}
				}
			}
			if (found) break;
		}
		
		if (found)
		{
			node->inferredType = fieldType;
			return;
		}
	}

	// Handle generic types: Struct<T>
	// This part was duplicated above but with incomplete logic.
	// The logic above handles finding the struct and substituting generics.
	// If we reached here, it means we didn't return early, so we should fall through to the error.
	// BUT, the code above (lines 140-170) was trying to do exactly what this code does.
	// I should remove the duplicate logic I added above and let this handle it.
	// The issue was that I added logic to handle Struct<T> inside the pointer deref block? No.
	
	// Let's clean up. The code I added above (lines 140-170) was:
	/*
	// Handle generic types: Struct<T>
	std::string baseName;
	std::vector<std::string> typeArgs;
	parseGenericType(typeName, baseName, typeArgs);

	auto it = structTable.find(baseName);
	if (it != structTable.end())
	{
		...
	}
	*/
	
	// This logic is redundant with the logic at the end of the function.
	// I should remove the block I added and let the logic at the end handle it.
	// The logic at the end handles Struct<T> correctly.
	
	// So, I will remove the block I added in the previous step.
	
	// Wait, the previous step added logic to handle Struct<T> BEFORE checking for slice pointer.
	// This is because *Slice<T> becomes Slice<T> after pointer stripping.
	// And Slice<T> is a struct.
	// So we want to check if it's a struct first.
	
	// The problem is that I duplicated the logic.
	// I should just let the control flow fall through to the end where Struct<T> is handled.
	
	// So I will remove the block I added.

	
	// Handle pointer to slice: *[T] or *mut [T]
	// These have virtual fields: .init and .length (both USize)
	// We check this AFTER struct check because *Slice<T> is a struct pointer
	// But if it's a raw slice pointer, we handle it here.
	// Note: typeName was stripped of pointer above, so we check if it starts with [
	if (typeName.length() > 0 && typeName[0] == '[')
	{
		// Check if it's a slice [T] (no semicolons) or sized array [T; N; C]
		// Both have init/length if accessed via pointer (which we stripped)
		// Actually, sized arrays have fixed length, but we can still access it
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
