#include "codegen_cpp.h"
#include <sstream>
#include <vector>
#include <set>
#include <map>
#include <functional>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;

	// Standard includes
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n";
	ss << "#include <cstddef>\n";
	ss << "#include <string>\n";

	// Collect extern use declarations and emit corresponding includes
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::EXTERN_USE_DECL)
		{
			ss << "#include \"" << child->value << ".h\"\n";
		}
	}
	ss << "\n";

	// Collect all types that need to be declared
	std::vector<std::shared_ptr<ASTNode>> enums;
	std::vector<std::shared_ptr<ASTNode>> allTypes; // structs + type aliases
	std::vector<std::shared_ptr<ASTNode>> functions;
	std::vector<std::shared_ptr<ASTNode>> actualDecls;
	std::vector<std::shared_ptr<ASTNode>> implDecls;
	std::vector<std::shared_ptr<ASTNode>> moduleDecls;

	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::ENUM_DECL)
			enums.push_back(child);
		else if (child->type == ASTNodeType::STRUCT_DECL)
			allTypes.push_back(child);
		else if (child->type == ASTNodeType::TYPE_ALIAS)
		{
			allTypes.push_back(child);
			// Store type alias expansion for later use (e.g., Option -> Some<T>|None<T>)
			// child->value is the alias name, child->inferredType is the expanded type
			std::string baseName = child->value;
			// For generic aliases like Option<T>, we store just "Option" -> expanded type
			typeAliasExpansions[baseName] = child->inferredType;
		}
		else if (child->type == ASTNodeType::FUNCTION_DECL)
			functions.push_back(child);
		else if (child->type == ASTNodeType::ACTUAL_DECL)
			actualDecls.push_back(child);
		else if (child->type == ASTNodeType::IMPL_DECL)
			implDecls.push_back(child);
		else if (child->type == ASTNodeType::MODULE_DECL)
			moduleDecls.push_back(child);
	}

	// Collect all union types used in the program
	std::set<std::string> unionTypes;
	std::function<void(std::shared_ptr<ASTNode>)> collectUnionTypes = [&](std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return;
		if (!node->inferredType.empty() && isUnionType(node->inferredType))
		{
			unionTypes.insert(node->inferredType);
		}
		for (auto child : node->children)
		{
			collectUnionTypes(child);
		}
	};
	collectUnionTypes(ast);

	// Deduplicate union types: prefer generic versions over concrete ones
	std::map<std::string, std::string> unionStructToGeneric;
	for (const auto &unionType : unionTypes)
	{
		std::string structName = getUnionStructName(unionType);
		bool isGeneric = false;
		auto variants = splitUnionType(unionType);
		for (const auto &variant : variants)
		{
			size_t start = variant.find('<');
			if (start != std::string::npos)
			{
				size_t end = variant.find('>');
				if (end != std::string::npos)
				{
					std::string param = variant.substr(start + 1, end - start - 1);
					if (param.length() == 1 && param[0] >= 'A' && param[0] <= 'Z')
					{
						isGeneric = true;
						break;
					}
				}
			}
		}
		if (unionStructToGeneric.find(structName) == unionStructToGeneric.end() || isGeneric)
		{
			unionStructToGeneric[structName] = unionType;
		}
	}

	// ========== Generate module declarations ==========
	for (auto node : moduleDecls)
	{
		ss << generateNode(node) << "\n";
	}

	// ========== Generate enum declarations ==========
	for (auto node : enums)
	{
		ss << generateNode(node) << "\n";
	}

	// ========== Topologically sort all types (structs + type aliases) ==========
	auto sortedTypes = topologicalSortTypes(allTypes);

	// Separate type aliases that reference union types
	std::vector<std::shared_ptr<ASTNode>> regularTypes;
	std::vector<std::shared_ptr<ASTNode>> unionAliases;

	for (auto node : sortedTypes)
	{
		if (node->type == ASTNodeType::TYPE_ALIAS && isUnionType(node->inferredType))
		{
			unionAliases.push_back(node);
		}
		else
		{
			regularTypes.push_back(node);
		}
	}

	// Generate struct forward declarations
	for (auto node : regularTypes)
	{
		if (node->type != ASTNodeType::STRUCT_DECL)
			continue;
		if (!node->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < node->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << node->genericParams[i]->value;
			}
			ss << "> ";
		}
		ss << "struct " << node->value << ";\n";
	}
	ss << "\n";

	// Generate types in sorted order (structs + non-union type aliases interleaved)
	for (auto node : regularTypes)
	{
		if (node->type == ASTNodeType::STRUCT_DECL)
		{
			ss << generateNode(node) << "\n";
		}
		else if (node->type == ASTNodeType::TYPE_ALIAS)
		{
			if (!node->genericParams.empty())
			{
				ss << "template<";
				for (size_t i = 0; i < node->genericParams.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << "typename " << node->genericParams[i]->value;
				}
				ss << ">\n";
			}
			ss << "using " << node->value << " = " << mapType(node->inferredType) << ";\n";
		}
	}

	// ========== Generate union struct definitions ==========
	for (const auto &pair : unionStructToGeneric)
	{
		ss << generateUnionStruct(pair.second) << "\n";
	}

	// ========== Generate type aliases that reference union types ==========
	for (auto node : unionAliases)
	{
		if (!node->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < node->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << node->genericParams[i]->value;
			}
			ss << ">\n";
		}
		ss << "using " << node->value << " = " << mapType(node->inferredType) << ";\n";
	}

	// ========== Generate function forward declarations ==========
	for (auto child : functions)
	{
		std::string funcName = child->value;
		if (funcName == "main")
			funcName = "tuff_main";

		if (!child->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < child->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << child->genericParams[i]->value;
			}
			ss << ">\n";
		}
		ss << mapType(child->inferredType) << " " << funcName << "(";
		for (size_t i = 0; i < child->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			std::string paramType = mapType(child->children[i]->inferredType);
			std::string paramName = child->children[i]->value;
			size_t bracketPos = paramType.find('[');
			if (bracketPos != std::string::npos)
			{
				std::string baseType = paramType.substr(0, bracketPos);
				std::string arraySuffix = paramType.substr(bracketPos);
				ss << baseType << " " << paramName << arraySuffix;
			}
			// Handle function pointer parameters: RetType (*)(Params) -> RetType (*name)(Params)
			else if (paramType.find("(*)") != std::string::npos)
			{
				size_t funcPtrPos = paramType.find("(*)");
				std::string retType = paramType.substr(0, funcPtrPos);
				std::string params = paramType.substr(funcPtrPos + 3);
				while (!retType.empty() && retType.back() == ' ')
					retType.pop_back();
				ss << retType << " (*" << paramName << ")" << params;
			}
			else
			{
				ss << paramType << " " << paramName;
			}
		}
		ss << ");\n";
	}

	// ========== Generate actual function forward declarations ==========
	for (auto child : actualDecls)
	{
		ss << mapType(child->inferredType) << " " << child->value << "(";
		size_t paramCount = 0;
		for (auto param : child->children)
		{
			if (param->type == ASTNodeType::IDENTIFIER)
			{
				if (paramCount > 0)
					ss << ", ";
				std::string paramType = mapType(param->inferredType);
				std::string paramName = param->value;
				size_t bracketPos = paramType.find('[');
				if (bracketPos != std::string::npos)
				{
					std::string baseType = paramType.substr(0, bracketPos);
					std::string arraySuffix = paramType.substr(bracketPos);
					ss << baseType << " " << paramName << arraySuffix;
				}
				else
				{
					ss << paramType << " " << paramName;
				}
				paramCount++;
			}
		}
		ss << ");\n";
	}

	// ========== Generate impl method forward declarations ==========
	for (auto child : implDecls)
	{
		std::vector<std::shared_ptr<ASTNode>> implGenericParams = child->genericParams;
		for (auto method : child->children)
		{
			if (method->type == ASTNodeType::FUNCTION_DECL)
			{
				std::string methodName = method->value;
				size_t colonPos = methodName.find("::");
				if (colonPos != std::string::npos)
				{
					methodName.replace(colonPos, 2, "_");
				}

				std::vector<std::shared_ptr<ASTNode>> allGenericParams = implGenericParams;
				for (auto param : method->genericParams)
				{
					allGenericParams.push_back(param);
				}

				if (!allGenericParams.empty())
				{
					ss << "template<";
					for (size_t i = 0; i < allGenericParams.size(); i++)
					{
						if (i > 0)
							ss << ", ";
						ss << "typename " << allGenericParams[i]->value;
					}
					ss << ">\n";
				}

				ss << mapType(method->inferredType) << " " << methodName << "(";
				for (size_t i = 0; i < method->children.size() - 1; i++)
				{
					if (i > 0)
						ss << ", ";
					std::string paramType = mapType(method->children[i]->inferredType);
					std::string paramName = method->children[i]->value;
					if (paramName == "this")
						paramName = "this_";

					size_t bracketPos = paramType.find('[');
					if (bracketPos != std::string::npos)
					{
						std::string baseType = paramType.substr(0, bracketPos);
						std::string arraySuffix = paramType.substr(bracketPos);
						ss << baseType << " " << paramName << arraySuffix;
					}
					else
					{
						ss << paramType << " " << paramName;
					}
				}
				ss << ");\n";
			}
		}
	}

	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL || type == ASTNodeType::MODULE_DECL;
	};

	// Determine return type from last expression (if last node is an expression)
	std::string returnType = "int"; // default
	bool needsEnumCast = false;
	bool hasReturnValue = false;

	if (ast->children.size() > 0)
	{
		auto lastNode = ast->children.back();
		if (!isStatement(lastNode->type))
		{
			hasReturnValue = true;
			std::string inferredType = lastNode->inferredType;
			// Check if it's an enum type (not a primitive type)
			if (inferredType != "I32" && inferredType != "Bool" && inferredType != "I8" &&
					inferredType != "I16" && inferredType != "I64" && inferredType != "U8" &&
					inferredType != "U16" && inferredType != "U32" && inferredType != "U64" &&
					inferredType != "F32" && inferredType != "F64" && inferredType != "Void")
			{
				// Assume it's an enum, keep return type as int and cast
				needsEnumCast = true;
			}
			else if (inferredType == "Void")
			{
				returnType = "int"; // main must return int
				hasReturnValue = false;
			}
			else
			{
				returnType = mapType(inferredType);
				if (returnType == "bool")
					returnType = "int"; // main must return int
			}
		}
	}

	// Generate main function (unless compiling as library)
	if (!isLibrary)
	{
		ss << "int main() {\n";

		// Check if there's a user-defined main function
		bool hasUserMain = false;
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::FUNCTION_DECL && child->value == "main")
			{
				hasUserMain = true;
				break;
			}
		}

		if (hasUserMain)
		{
			// Call the user's main function
			ss << "    return tuff_main();\n";
		}
		else
		{
			// Execute top-level statements
			for (size_t i = 0; i < ast->children.size(); ++i)
			{
				auto child = ast->children[i];

				// Skip struct, enum, function, expect, actual, extern, module, and impl declarations (already generated)
				if (child->type == ASTNodeType::STRUCT_DECL || child->type == ASTNodeType::ENUM_DECL || child->type == ASTNodeType::FUNCTION_DECL || child->type == ASTNodeType::EXPECT_DECL || child->type == ASTNodeType::ACTUAL_DECL || child->type == ASTNodeType::EXTERN_FN_DECL || child->type == ASTNodeType::EXTERN_TYPE_DECL || child->type == ASTNodeType::MODULE_DECL || child->type == ASTNodeType::IMPL_DECL)
					continue;

				if (i == ast->children.size() - 1 && !isStatement(child->type))
				{
					// Last node is an expression: return its value
					if (needsEnumCast)
					{
						ss << "    return static_cast<int>(" << generateNode(child) << ");\n";
					}
					else if (hasReturnValue)
					{
						ss << "    return " << generateNode(child) << ";\n";
					}
					else
					{
						ss << "    " << generateNode(child) << ";\n";
						ss << "    return 0;\n";
					}
				}
				else
				{
					// Earlier nodes or statements: execute for side effects
					ss << "    " << generateNode(child) << ";\n";
				}
			}

			if (ast->children.empty() || isStatement(ast->children.back()->type))
			{
				ss << "    return 0;\n";
			}
		}

		ss << "}\n";
	} // end if (!isLibrary)

	// Generate function definitions
	bool hasMainFunction = false;
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			if (child->value == "main")
			{
				hasMainFunction = true;
			}
			ss << "\n"
				 << generateNode(child) << "\n";
		}
		else if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			ss << "\n"
				 << generateNode(child) << "\n";
		}
		else if (child->type == ASTNodeType::IMPL_DECL)
		{
			ss << "\n"
				 << generateNode(child) << "\n";
		}
	}

	return ss.str();
}
