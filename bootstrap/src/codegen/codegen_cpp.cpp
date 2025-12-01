#include "codegen_cpp.h"
#include <sstream>
#include <vector>
#include <set>
#include <map>
#include <functional>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;

	// If using shared header, just include it
	if (useSharedHeader)
	{
		ss << "#include \"tuff_decls.h\"\n\n";
	}
	else
	{
		// Generate everything inline for backward compatibility
		ss << "#include <iostream>\n";
		ss << "#include <cstdint>\n";
		ss << "#include <cstddef>\n";
		ss << "#include <string>\n\n";
	}

	// Only generate type definitions and forward declarations if not using shared header
	if (!useSharedHeader)
	{

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
		// Group by base structure (e.g., Some<T>|None<T> and Some<I32>|None<I32> both map to Union_Some_None)
		std::map<std::string, std::string> unionStructToGeneric;
		for (const auto &unionType : unionTypes)
		{
			std::string structName = getUnionStructName(unionType);

			// Check if this union uses generic params (single letters T, U, etc.)
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

			// Prefer generic versions
			if (unionStructToGeneric.find(structName) == unionStructToGeneric.end() || isGeneric)
			{
				unionStructToGeneric[structName] = unionType;
			}
		}

		// Note: union struct generation moved after struct declarations to avoid forward reference errors

		// Collect struct field information for intersection types
		std::map<std::string, std::vector<std::pair<std::string, std::string>>> structFields;
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::STRUCT_DECL)
			{
				std::string structName = child->value;
				std::vector<std::pair<std::string, std::string>> fields;
				for (auto field : child->children)
				{
					fields.push_back({field->value, field->inferredType});
				}
				structFields[structName] = fields;
			}
		}

		// Collect all intersection types used in the program
		std::set<std::string> intersectionTypes;
		std::function<void(std::shared_ptr<ASTNode>)> collectIntersectionTypes = [&](std::shared_ptr<ASTNode> node)
		{
			if (!node)
				return;
			if (!node->inferredType.empty() && isIntersectionType(node->inferredType))
			{
				intersectionTypes.insert(node->inferredType);
			}
			for (auto child : node->children)
			{
				collectIntersectionTypes(child);
			}
		};
		collectIntersectionTypes(ast);

		// Filter out intersection types that are just extern types with destructors
		// e.g., NativeString&~string_destroy should not generate a wrapper struct
		std::set<std::string> filteredIntersectionTypes;
		std::set<std::string> externTypes = {"NativeString"}; // Known extern types

		for (const auto &intersectionType : intersectionTypes)
		{
			auto components = splitIntersectionType(intersectionType);
			bool isExternWithDestructor = false;

			// Check if this is just ExternType & ~destructor
			if (components.size() == 2)
			{
				bool hasExternType = false;
				bool hasDestructor = false;

				for (const auto &comp : components)
				{
					if (!comp.empty() && comp[0] == '~')
					{
						hasDestructor = true;
					}
					else if (externTypes.count(comp) > 0)
					{
						hasExternType = true;
					}
				}

				if (hasExternType && hasDestructor)
				{
					isExternWithDestructor = true;
				}
			}

			if (!isExternWithDestructor)
			{
				filteredIntersectionTypes.insert(intersectionType);
			}
		}

		auto isStatement = [](ASTNodeType type)
		{
			return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL || type == ASTNodeType::MODULE_DECL;
		};

		// Generate module declarations first (at top level, not inside main)
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::MODULE_DECL)
			{
				ss << generateNode(child) << "\n";
			}
		}

		// Generate enum declarations
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::ENUM_DECL)
			{
				ss << generateNode(child) << "\n";
			}
		}

		// Generate extern function forward declarations
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::EXTERN_FN_DECL)
			{
				ss << "extern \"C\" " << mapType(child->inferredType) << " " << child->value << "(";
				for (size_t i = 0; i < child->children.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << mapType(child->children[i]->inferredType);
				}
				ss << ");\n";
			}
		}

		// Generate struct declarations
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::STRUCT_DECL)
			{
				ss << generateNode(child) << "\n";
			}
		}

		// Generate union struct definitions AFTER struct declarations (to avoid forward reference errors)
		for (const auto &pair : unionStructToGeneric)
		{
			ss << generateUnionStruct(pair.second) << "\n";
		}

		// Generate function forward declarations (before intersection structs so destructors can reference them)
		for (auto child : ast->children)
		{
			if (child->type == ASTNodeType::FUNCTION_DECL)
			{
				// Rename main to tuff_main for forward declaration
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
					// Handle array parameters: int32_t arr[10] instead of int32_t[10] arr
					std::string paramType = mapType(child->children[i]->inferredType);
					std::string paramName = child->children[i]->value;
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
			else if (child->type == ASTNodeType::ACTUAL_DECL)
			{
				ss << mapType(child->inferredType) << " " << child->value << "(";
				size_t paramCount = 0;
				for (auto param : child->children)
				{
					if (param->type == ASTNodeType::IDENTIFIER)
					{
						if (paramCount > 0)
							ss << ", ";
						// Handle array parameters: int32_t arr[10] instead of int32_t[10] arr
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
		}

		// Generate intersection struct definitions (after regular structs and function forward declarations)
		for (const auto &intersectionType : filteredIntersectionTypes)
		{
			ss << generateIntersectionStruct(intersectionType, structFields) << "\n";
		}

	} // End of !useSharedHeader block

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

			// Skip struct, enum, function, expect, actual, extern, and module declarations (already generated)
			if (child->type == ASTNodeType::STRUCT_DECL || child->type == ASTNodeType::ENUM_DECL || child->type == ASTNodeType::FUNCTION_DECL || child->type == ASTNodeType::EXPECT_DECL || child->type == ASTNodeType::ACTUAL_DECL || child->type == ASTNodeType::EXTERN_FN_DECL || child->type == ASTNodeType::EXTERN_TYPE_DECL || child->type == ASTNodeType::MODULE_DECL)
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
	}

	return ss.str();
}
