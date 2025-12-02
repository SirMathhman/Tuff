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

					// Error: 'main' is reserved even in modules
					if (moduleChild->value == "main")
					{
						std::cerr << "Error: Function name 'main' is reserved. "
											<< "Top-level statements are automatically wrapped in a main() function. "
											<< "Please use a different function name." << std::endl;
						exit(1);
					}

					if (functionTable.find(funcName) != functionTable.end())
					{
						std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
						exit(1);
					}

					FunctionInfo info;
					for (auto genParam : moduleChild->genericParams)
					{
						info.genericParams.push_back(genParam->value);
						// Store type bounds if present
						if (!genParam->typeBound.empty())
						{
							info.genericBounds[genParam->value] = genParam->typeBound;
						}
					}
					for (const auto &lifetime : moduleChild->lifetimeParams)
					{
						info.lifetimeParams.push_back(lifetime);
					}
					info.returnType = moduleChild->inferredType;
					info.returnTypeExpr = resolveType(moduleChild->returnTypeNode); // New
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

						// Populate ExprPtr param type
						auto paramTypeExpr = resolveType(paramNode->typeNode);
						// TODO: Handle qualification for ExprPtr
						info.paramTypesExpr.push_back({paramNode->value, paramTypeExpr});
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

					// Set current struct context
					currentStruct = structName;

					for (auto fieldNode : moduleChild->children)
					{
						info.fields.push_back({fieldNode->value, fieldNode->inferredType});
						info.fieldTypesExpr.push_back({fieldNode->value, resolveType(fieldNode->typeNode)}); // New
					}

					// Clear struct context
					currentStruct = "";

					structTable[structName] = info;
				}
				else if (moduleChild->type == ASTNodeType::TYPE_ALIAS)
				{
					std::string aliasName = currentModule + "::" + moduleChild->value;
					if (typeAliasTable.find(aliasName) != typeAliasTable.end())
					{
						std::cerr << "Error: Type alias '" << aliasName << "' already declared." << std::endl;
						exit(1);
					}

					TypeAliasInfo info;
					info.aliasedType = moduleChild->inferredType;
					info.aliasedTypeExpr = resolveType(moduleChild->typeNode); // New
					for (auto genParam : moduleChild->genericParams)
					{
						info.genericParams.push_back(genParam->value);
					}
					typeAliasTable[aliasName] = info;
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
					info.returnTypeExpr = resolveType(moduleChild->returnTypeNode); // New
					for (size_t i = 0; i < moduleChild->children.size(); i++)
					{
						auto paramNode = moduleChild->children[i];
						info.params.push_back({paramNode->value, paramNode->inferredType});
						info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
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
					info.returnTypeExpr = resolveType(moduleChild->returnTypeNode); // New
					for (size_t i = 0; i < paramCount; i++)
					{
						auto paramNode = moduleChild->children[i];
						info.params.push_back({paramNode->value, paramNode->inferredType});
						info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
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

			// Error: 'main' is reserved for the generated entry point
			if (funcName == "main")
			{
				std::cerr << "Error: Function name 'main' is reserved. "
									<< "Top-level statements are automatically wrapped in a main() function. "
									<< "Please use a different function name." << std::endl;
				exit(1);
			}

			if (functionTable.find(funcName) != functionTable.end())
			{
				std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
				exit(1);
			}

			FunctionInfo info;
			for (auto genParam : child->genericParams)
			{
				info.genericParams.push_back(genParam->value);
				// Store type bounds if present
				if (!genParam->typeBound.empty())
				{
					info.genericBounds[genParam->value] = genParam->typeBound;
				}
			}
			for (const auto &lifetime : child->lifetimeParams)
			{
				info.lifetimeParams.push_back(lifetime);
			}
			info.returnType = child->inferredType;
			info.returnTypeExpr = resolveType(child->returnTypeNode); // New
			for (size_t i = 0; i < child->children.size() - 1; i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
				info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
			}
			functionTable[funcName] = info;
		}
		else if (child->type == ASTNodeType::IMPL_DECL)
		{
			// Extract struct name from impl block
			std::string structName = child->value;
			if (structName.empty() && child->typeNode)
			{
				structName = child->typeNode->value;
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
			info.returnTypeExpr = resolveType(child->returnTypeNode); // New
			for (size_t i = 0; i < child->children.size(); i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
				info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
			}
			expectTable[expectName] = info;
		}
		else if (child->type == ASTNodeType::EXTERN_FN_DECL)
		{
			// extern fn declares an external function (e.g., from C library)
			// Register directly in functionTable, no expect/actual matching
			std::string funcName = child->value;
			if (functionTable.find(funcName) != functionTable.end())
			{
				std::cerr << "Error: Function '" << funcName << "' already declared." << std::endl;
				exit(1);
			}

			FunctionInfo info;
			info.isExtern = true; // Mark as extern
			for (auto genParam : child->genericParams)
			{
				info.genericParams.push_back(genParam->value);
			}
			// Expand type aliases in return type
			info.returnType = expandTypeAlias(child->inferredType);
			info.returnTypeExpr = resolveType(child->returnTypeNode); // New
			for (size_t i = 0; i < child->children.size(); i++)
			{
				auto paramNode = child->children[i];
				// Expand type aliases in parameter types
				std::string paramType = expandTypeAlias(paramNode->inferredType);
				info.params.push_back({paramNode->value, paramType});
				info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
			}
			functionTable[funcName] = info;
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
			info.returnTypeExpr = resolveType(child->returnTypeNode); // New
			for (size_t i = 0; i < paramCount; i++)
			{
				auto paramNode = child->children[i];
				info.params.push_back({paramNode->value, paramNode->inferredType});
				info.paramTypesExpr.push_back({paramNode->value, resolveType(paramNode->typeNode)}); // New
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

			// Set current struct context for field validation
			currentStruct = structName;

			for (auto fieldNode : child->children)
			{
				// Validate field type (e.g. check this.field references)
				// For now, we just store it, but we should validate it
				// TODO: Validate field type with currentStruct context
				info.fields.push_back({fieldNode->value, fieldNode->inferredType});
				info.fieldTypesExpr.push_back({fieldNode->value, resolveType(fieldNode->typeNode)}); // New
			}

			// Clear struct context
			currentStruct = "";

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
		else if (child->type == ASTNodeType::TYPE_ALIAS)
		{
			std::string aliasName = child->value;
			if (typeAliasTable.find(aliasName) != typeAliasTable.end())
			{
				std::cerr << "Error: Type alias '" << aliasName << "' already declared." << std::endl;
				exit(1);
			}

			TypeAliasInfo info;
			info.aliasedType = child->inferredType;
			info.aliasedTypeExpr = resolveType(child->typeNode); // New
			for (auto genParam : child->genericParams)
			{
				info.genericParams.push_back(genParam->value);
				// Store type bounds if present
				if (!genParam->typeBound.empty())
				{
					info.genericBounds[genParam->value] = genParam->typeBound;
				}
			}
			typeAliasTable[aliasName] = info;
		}
		else if (child->type == ASTNodeType::EXTERN_TYPE_DECL)
		{
			// If extern type has an alias (type extern Name = Type), register it
			if (!child->inferredType.empty())
			{
				std::string aliasName = child->value;
				if (typeAliasTable.find(aliasName) != typeAliasTable.end())
				{
					std::cerr << "Error: Type alias '" << aliasName << "' already declared." << std::endl;
					exit(1);
				}

				TypeAliasInfo info;
				info.aliasedType = child->inferredType;
				info.aliasedTypeExpr = resolveType(child->typeNode); // New
				for (auto genParam : child->genericParams)
				{
					info.genericParams.push_back(genParam->value);
				}
				typeAliasTable[aliasName] = info;
			}
		}
	}
}
