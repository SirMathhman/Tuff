#include "type_checker.h"
#include <iostream>

void TypeChecker::checkBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = node->children[0];
	auto right = node->children[1];
	check(left);
	check(right);

	std::string leftType = left->inferredType;
	std::string rightType = right->inferredType;

	if (node->value == "+" || node->value == "-" || node->value == "*" || node->value == "/")
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

	auto it = structTable.find(object->inferredType);
	if (it == structTable.end())
	{
		std::cerr << "Error: Cannot access field '" << fieldName << "' on non-struct type '" << object->inferredType << "'." << std::endl;
		exit(1);
	}

	const StructInfo &info = it->second;
	for (const auto &field : info.fields)
	{
		if (field.first == fieldName)
		{
			node->inferredType = field.second;
			return;
		}
	}

	std::cerr << "Error: Struct '" << object->inferredType << "' has no field named '" << fieldName << "'." << std::endl;
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
		std::cerr << "Error: Function '" << funcName << "' not declared." << std::endl;
		exit(1);
	}

	const FunctionInfo &info = it->second;

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
		if (arg->inferredType != info.params[i].second)
		{
			std::cerr << "Error: Argument " << (i + 1) << " to function '" << funcName
								<< "' has type " << arg->inferredType << ", expected " << info.params[i].second << std::endl;
			exit(1);
		}
	}

	node->inferredType = info.returnType;
}

void TypeChecker::registerDeclarations(std::shared_ptr<ASTNode> node)
{
	for (auto child : node->children)
	{
		if (child->type == ASTNodeType::MODULE_DECL)
		{
			// Save current module and switch context
			std::string savedModule = currentModule;
			currentModule = child->value;

			// First pass: collect local type names (enums, structs) defined in this module
			std::vector<std::string> localTypeNames;
			for (auto moduleChild : child->children)
			{
				if (moduleChild->type == ASTNodeType::ENUM_DECL)
				{
					localTypeNames.push_back(moduleChild->value);
				}
				else if (moduleChild->type == ASTNodeType::STRUCT_DECL)
				{
					localTypeNames.push_back(moduleChild->value);
				}
			}

			// Second pass: register declarations with proper type prefixing
			for (auto moduleChild : child->children)
			{
				if (moduleChild->type == ASTNodeType::FUNCTION_DECL)
				{
					std::string funcName = currentModule + "::" + moduleChild->value;
					if (functionTable.find(funcName) != functionTable.end())
					{
						std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
						exit(1);
					}

					FunctionInfo info;
					info.returnType = moduleChild->inferredType;
					for (size_t i = 0; i < moduleChild->children.size() - 1; i++)
					{
						auto paramNode = moduleChild->children[i];
						std::string paramType = paramNode->inferredType;
						
						// If param type is a local type, prefix it with module name
						bool isLocalType = false;
						for (const auto &localType : localTypeNames)
						{
							if (paramType == localType)
							{
								paramType = currentModule + "::" + paramType;
								isLocalType = true;
								break;
							}
						}
						
						info.params.push_back({paramNode->value, paramType});
					}
					
					// Normalize return type too
					std::string returnType = moduleChild->inferredType;
					for (const auto &localType : localTypeNames)
					{
						if (returnType == localType)
						{
							returnType = currentModule + "::" + returnType;
							break;
						}
					}
					info.returnType = returnType;
					
					functionTable[funcName] = info;
					// Also register without prefix for local access within module
					functionTable[moduleChild->value] = info;
				}
				else if (moduleChild->type == ASTNodeType::ENUM_DECL)
				{
					std::string enumName = currentModule + "::" + moduleChild->value;
					if (enumTable.find(enumName) != enumTable.end())
					{
						std::cerr << "Error: Enum '" << enumName << "' already declared." << std::endl;
						exit(1);
					}

					EnumInfo info;
					for (auto variantNode : moduleChild->children)
					{
						info.variants.push_back(variantNode->value);
					}
					enumTable[enumName] = info;
					// Also register without prefix for local access within module
					enumTable[moduleChild->value] = info;
				}
				else if (moduleChild->type == ASTNodeType::STRUCT_DECL)
				{
					std::string structName = currentModule + "::" + moduleChild->value;
					if (structTable.find(structName) != structTable.end())
					{
						std::cerr << "Error: Struct '" << structName << "' already declared." << std::endl;
						exit(1);
					}

					StructInfo info;
					for (auto fieldNode : moduleChild->children)
					{
						info.fields.push_back({fieldNode->value, fieldNode->inferredType});
					}
					structTable[structName] = info;
					// Also register without prefix for local access within module
					structTable[moduleChild->value] = info;
				}
			}

			// Restore previous module context
			currentModule = savedModule;
		}
		else if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			std::string funcName = child->value;
			if (functionTable.find(funcName) != functionTable.end())
			{
				std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
				exit(1);
			}

			FunctionInfo info;
			info.returnType = child->inferredType;
			for (size_t i = 0; i < child->children.size() - 1; i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
			}
			functionTable[funcName] = info;
		}
		else if (child->type == ASTNodeType::EXPECT_DECL)
		{
			std::string expectName = child->value;
			if (expectTable.find(expectName) != expectTable.end())
			{
				std::cerr << "Error: Expect '" << expectName << "' already declared." << std::endl;
				exit(1);
			}

			ExpectInfo info;
			info.returnType = child->inferredType;
			for (size_t i = 0; i < child->children.size(); i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
			}
			expectTable[expectName] = info;
		}
		else if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			std::string actualName = child->value;

			if (expectTable.find(actualName) == expectTable.end())
			{
				std::cerr << "Error: Actual '" << actualName << "' has no matching expect declaration." << std::endl;
				exit(1);
			}

			const ExpectInfo &expectedSig = expectTable[actualName];

			if (child->inferredType != expectedSig.returnType)
			{
				std::cerr << "Error: Actual '" << actualName << "' return type mismatch. Expected "
									<< expectedSig.returnType << ", got " << child->inferredType << std::endl;
				exit(1);
			}

			size_t paramCount = 0;
			for (auto param : child->children)
			{
				if (param->type == ASTNodeType::IDENTIFIER)
					paramCount++;
			}

			if (paramCount != expectedSig.params.size())
			{
				std::cerr << "Error: Actual '" << actualName << "' parameter count mismatch. Expected "
									<< expectedSig.params.size() << ", got " << paramCount << std::endl;
				exit(1);
			}

			FunctionInfo info;
			info.returnType = child->inferredType;
			for (size_t i = 0; i < paramCount; i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
			}
			functionTable[actualName] = info;
		}
		else if (child->type == ASTNodeType::STRUCT_DECL)
		{
			std::string structName = child->value;
			if (structTable.find(structName) != structTable.end())
			{
				std::cerr << "Error: Struct '" << structName << "' already declared." << std::endl;
				exit(1);
			}

			StructInfo info;
			for (auto fieldNode : child->children)
			{
				info.fields.push_back({fieldNode->value, fieldNode->inferredType});
			}
			structTable[structName] = info;
		}
		else if (child->type == ASTNodeType::ENUM_DECL)
		{
			std::string enumName = child->value;
			if (enumTable.find(enumName) != enumTable.end())
			{
				std::cerr << "Error: Enum '" << enumName << "' already declared." << std::endl;
				exit(1);
			}

			EnumInfo info;
			for (auto variantNode : child->children)
			{
				info.variants.push_back(variantNode->value);
			}
			enumTable[enumName] = info;
		}
	}
}
