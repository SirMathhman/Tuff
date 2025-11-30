#include "type_checker.h"
#include <iostream>

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
					for (auto genParam : moduleChild->genericParams)
					{
						info.genericParams.push_back(genParam->value);
					}
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
					for (auto genParam : moduleChild->genericParams)
					{
						info.genericParams.push_back(genParam->value);
					}
					for (auto fieldNode : moduleChild->children)
					{
						info.fields.push_back({fieldNode->value, fieldNode->inferredType});
					}
					structTable[structName] = info;
				}
				else if (moduleChild->type == ASTNodeType::EXPECT_DECL)
				{
					std::string expectName = currentModule + "::" + moduleChild->value;
					if (expectTable.find(expectName) != expectTable.end())
					{
						std::cerr << "Error: Expect '" << expectName << "' already declared." << std::endl;
						exit(1);
					}

					ExpectInfo info;
					info.returnType = moduleChild->inferredType;
					for (size_t i = 0; i < moduleChild->children.size(); i++)
					{
						auto paramNode = moduleChild->children[i];
						info.params.push_back({paramNode->value, paramNode->inferredType});
					}
					expectTable[expectName] = info;
				}
				else if (moduleChild->type == ASTNodeType::ACTUAL_DECL)
				{
					std::string actualName = currentModule + "::" + moduleChild->value;

					if (expectTable.find(actualName) == expectTable.end())
					{
						std::cerr << "Error: Actual '" << actualName << "' has no matching expect declaration." << std::endl;
						exit(1);
					}

					const ExpectInfo &expectedSig = expectTable[actualName];

					if (moduleChild->inferredType != expectedSig.returnType)
					{
						std::cerr << "Error: Actual '" << actualName << "' return type mismatch. Expected "
											<< expectedSig.returnType << ", got " << moduleChild->inferredType << std::endl;
						exit(1);
					}

					size_t paramCount = 0;
					for (auto param : moduleChild->children)
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
					info.returnType = moduleChild->inferredType;
					for (size_t i = 0; i < paramCount; i++)
					{
						auto paramNode = moduleChild->children[i];
						info.params.push_back({paramNode->value, paramNode->inferredType});
					}
					functionTable[actualName] = info;
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
			for (auto genParam : child->genericParams)
			{
				info.genericParams.push_back(genParam->value);
			}
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
			for (auto genParam : child->genericParams)
			{
				info.genericParams.push_back(genParam->value);
			}
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
