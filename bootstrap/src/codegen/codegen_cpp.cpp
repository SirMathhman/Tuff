#include "codegen_cpp.h"
#include <sstream>
#include <vector>
#include <set>
#include <map>
#include <functional>

// Helper: check if a type is a function pointer type (starts with |)
bool CodeGeneratorCPP::isFunctionPointerType(const std::string &type)
{
	return !type.empty() && type[0] == '|';
}

// Helper: format a C++ function pointer parameter declaration
// Input: paramType = "int32_t (*)(int32_t, int32_t)", paramName = "f"
// Output: "int32_t (*f)(int32_t, int32_t)"
std::string CodeGeneratorCPP::formatFunctionPointerParam(const std::string &paramType, const std::string &paramName)
{
	size_t funcPtrPos = paramType.find("(*)");
	if (funcPtrPos != std::string::npos)
	{
		std::string retType = paramType.substr(0, funcPtrPos);
		std::string params = paramType.substr(funcPtrPos + 3);
		while (!retType.empty() && retType.back() == ' ')
			retType.pop_back();
		return retType + " (*" + paramName + ")" + params;
	}
	return paramType + " " + paramName;
}

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;

	// Standard includes
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n";
	ss << "#include <cstddef>\n";
	ss << "#include <string>\n";
	ss << "#include \"argv_builtins.h\"\n";

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
	std::map<std::string, std::pair<std::string, std::vector<std::string>>> unionStructToGeneric;
	for (const auto &unionType : unionTypes)
	{
		std::string structName = getUnionStructName(unionType);
		bool isGeneric = false;
		std::vector<std::string> typeParams;

		auto variants = splitUnionType(unionType);
		for (const auto &variant : variants)
		{
			size_t start = variant.find('<');
			if (start != std::string::npos)
			{
				size_t end = variant.find('>');
				if (end != std::string::npos)
				{
					std::string paramsStr = variant.substr(start + 1, end - start - 1);
					// Parse comma-separated parameters
					std::string currentParam;
					for (char c : paramsStr)
					{
						if (c == ',')
						{
							// Trim whitespace
							while (!currentParam.empty() && currentParam.front() == ' ')
								currentParam.erase(0, 1);
							while (!currentParam.empty() && currentParam.back() == ' ')
								currentParam.pop_back();
							// Check if it's a generic param (single uppercase letter)
							if (currentParam.length() == 1 && currentParam[0] >= 'A' && currentParam[0] <= 'Z')
							{
								isGeneric = true;
								// Add to type params if not already present
								bool found = false;
								for (const auto &p : typeParams)
								{
									if (p == currentParam)
									{
										found = true;
										break;
									}
								}
								if (!found)
								{
									typeParams.push_back(currentParam);
								}
							}
							currentParam.clear();
						}
						else
						{
							currentParam += c;
						}
					}
					// Handle last parameter
					while (!currentParam.empty() && currentParam.front() == ' ')
						currentParam.erase(0, 1);
					while (!currentParam.empty() && currentParam.back() == ' ')
						currentParam.pop_back();
					if (currentParam.length() == 1 && currentParam[0] >= 'A' && currentParam[0] <= 'Z')
					{
						isGeneric = true;
						bool found = false;
						for (const auto &p : typeParams)
						{
							if (p == currentParam)
							{
								found = true;
								break;
							}
						}
						if (!found)
						{
							typeParams.push_back(currentParam);
						}
					}
				}
			}
		}

		if (unionStructToGeneric.find(structName) == unionStructToGeneric.end() || isGeneric)
		{
			unionStructToGeneric[structName] = {unionType, typeParams};
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
		ss << generateUnionStruct(pair.second.first, pair.second.second) << "\n";
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
	std::vector<std::shared_ptr<ASTNode>> allFunctions = functions;
	for (auto impl : implDecls)
	{
		for (auto child : impl->children)
		{
			if (child->type == ASTNodeType::FUNCTION_DECL)
			{
				allFunctions.push_back(child);
			}
		}
	}

	// ========== Generate function forward declarations ==========
	ss << generateForwardDeclarations(functions, implDecls, actualDecls);

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

	// ========== Generate global variables for 'in let' ==========
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::IN_LET_STMT)
		{
			std::string type = mapType(child->inferredType);
			std::string name = child->value;
			ss << type << " " << name << ";\n";
		}
	}

	// Generate main function (unless compiling as library)
	if (!isLibrary)
	{
		// Check for 'in let' declaration to determine main signature
		std::string argvName;
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::IN_LET_STMT)
			{
				argvName = child->value;
				break;
			}
		}

		if (!argvName.empty())
		{
			ss << "int main(int argc, char* argv[]) {\n";
			ss << "    // Convert argv to Tuff slice\n";
			ss << "    ArgvArray raw_" << argvName << " = __builtin_argv_convert(argc, argv);\n";
			ss << "    " << argvName << " = { raw_" << argvName << ".data, raw_" << argvName << ".len };\n";
		}
		else
		{
			ss << "int main() {\n";
		}

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

				// Skip 'in let' declarations (handled at start of main)
				if (child->type == ASTNodeType::IN_LET_STMT)
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

// ============================================================================
// PER-FILE CODE GENERATION
// ============================================================================

FileOutput CodeGeneratorCPP::generateFile(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	FileOutput output;
	output.header = generateFileHeader(ast, moduleName);
	output.implementation = generateFileImplementation(ast, moduleName);
	output.dependencies = extractDependencies(ast);
	return output;
}

bool CodeGeneratorCPP::shouldExport(std::shared_ptr<ASTNode> node)
{
	if (node->type == ASTNodeType::EXPECT_DECL)
		return true;
	if (node->type == ASTNodeType::FUNCTION_DECL && node->value == "main")
		return true;
	return node->isExported;
}

std::set<std::string> CodeGeneratorCPP::extractDependencies(std::shared_ptr<ASTNode> ast)
{
	std::set<std::string> deps;
	for (const auto &child : ast->children)
	{
		if (child->type == ASTNodeType::USE_DECL)
		{
			deps.insert(child->value);
		}
	}
	return deps;
}

std::string CodeGeneratorCPP::generateFileHeader(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream header;
	header << "#pragma once\n\n";
	header << "#include <cstdint>\n";
	header << "#include <string>\n";
	header << "#include <memory>\n\n";
	header << "// TODO: Implement full header generation\n";
	header << "// Module: " << moduleName << "\n";
	return header.str();
}

std::string CodeGeneratorCPP::generateFileImplementation(std::shared_ptr<ASTNode> ast, const std::string &moduleName)
{
	std::stringstream impl;
	impl << "#include \"" << moduleName << ".h\"\n\n";
	impl << "// TODO: Implement full implementation generation\n";
	impl << "// Module: " << moduleName << "\n";
	return impl.str();
}
