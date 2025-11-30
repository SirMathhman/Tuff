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

void TypeChecker::checkBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = left->inferredType;
	std::string rightType = right->inferredType;

	if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/" || node->value == "%")
	{
		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
			exit(1);
		}
		node->inferredType = "I32";
	}
	else if (node->value == "==" || node->value == "!=")
	{
		node->inferredType = "Bool";
	}
	else if (node->value == "<" || node->value == ">" || node->value == "<=" || node->value == ">=")
	{
		if (!isNumericType(leftType) || !isNumericType(rightType))
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be numeric." << std::endl;
			exit(1);
		}
		node->inferredType = "Bool";
	}
	else if (node->value == "&&" || node->value == "||")
	{
		if (leftType != "Bool" || rightType != "Bool")
		{
			std::cerr << "Error: Operands of '" << node->value << "' must be Bool." << std::endl;
			exit(1);
		}
		node->inferredType = "Bool";
	}
	else
	{
		std::cerr << "Error: Unknown binary operator '" << node->value << "'." << std::endl;
		exit(1);
	}
}

void TypeChecker::checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node)
{
	auto object = node->children[0];
	check(object);

	std::string fieldName = node->value;

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

	std::string typeName = object->inferredType;
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
		exit(1);
	}

	// Create substitution map
	std::map<std::string, std::string> typeSubstitutions;
	for (size_t i = 0; i < info.genericParams.size(); i++)
	{
		typeSubstitutions[info.genericParams[i]] = callee->genericArgs[i];
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

		if (arg->inferredType != expectedType)
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
	node->inferredType = returnType;
}

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

		if (fieldExpr->inferredType != expectedType)
		{
			std::cerr << "Error: Field " << (i + 1) << " of struct '" << structName
								<< "' expects type " << expectedType << ", got " << fieldExpr->inferredType << std::endl;
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

	if (node->isMutable)
	{
		if (operand->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = operand->value;
			auto it = symbolTable.find(name);
			if (it != symbolTable.end() && !it->second.isMutable)
			{
				std::cerr << "Error: Cannot take mutable reference of immutable variable '" << name << "'." << std::endl;
				exit(1);
			}
		}
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
		if (ptrType.substr(0, 5) == "*mut ")
			node->inferredType = ptrType.substr(5);
		else
			node->inferredType = ptrType.substr(1);
	}
	else
	{
		std::cerr << "Error: Cannot dereference non-pointer type '" << ptrType << "'." << std::endl;
		exit(1);
	}
}
