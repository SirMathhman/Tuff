#include "codegen_cpp.h"
#include <sstream>
#include <set>
#include <map>
#include <functional>

// Helper: check if a type is a function pointer type (starts with |)
static bool isFunctionPointerType(const std::string &type)
{
	return !type.empty() && type[0] == '|';
}

// Helper: format a C++ function pointer parameter declaration
// Input: paramType = "int32_t (*)(int32_t, int32_t)", paramName = "f"
// Output: "int32_t (*f)(int32_t, int32_t)"
static std::string formatFunctionPointerParam(const std::string &paramType, const std::string &paramName)
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

std::string CodeGeneratorCPP::generateSharedHeader(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;

	// Header guard
	ss << "#pragma once\n\n";

	// Standard includes
	ss << "#include <cstdint>\n";
	ss << "#include <cstddef>\n";
	ss << "#include <string>\n";
	ss << "#include \"string_builtins.h\"\n\n";

	// Collect all types that need to be declared
	std::vector<std::shared_ptr<ASTNode>> enums;
	std::vector<std::shared_ptr<ASTNode>> allTypes; // structs + type aliases together
	std::vector<std::shared_ptr<ASTNode>> functions;
	std::vector<std::shared_ptr<ASTNode>> externFns;

	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::ENUM_DECL)
			enums.push_back(child);
		else if (child->type == ASTNodeType::STRUCT_DECL)
			allTypes.push_back(child);
		else if (child->type == ASTNodeType::TYPE_ALIAS)
			allTypes.push_back(child);
		else if (child->type == ASTNodeType::FUNCTION_DECL ||
						 child->type == ASTNodeType::ACTUAL_DECL)
			functions.push_back(child);
		else if (child->type == ASTNodeType::EXTERN_FN_DECL)
			externFns.push_back(child);
	}

	// Collect all union types used in the AST
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

	// ========== PHASE 1: Enums (no dependencies) ==========
	for (auto node : enums)
	{
		ss << generateNode(node) << "\n";
	}

	// ========== PHASE 2: Sort all types (structs + aliases) together ==========
	auto sortedTypes = topologicalSortTypes(allTypes);

	// Separate type aliases that reference union types - they must come after unions
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

	// Generate forward declarations for all structs first
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

	// Generate definitions in sorted order (both structs and non-union type aliases)
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

	// ========== PHASE 3: Union types ==========
	// Union types depend on their variant structs, which should now be defined
	for (const auto &unionType : unionTypes)
	{
		ss << generateUnionStruct(unionType) << "\n";
	}

	// ========== PHASE 4: Type aliases that reference union types ==========
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
	ss << "\n";

	// ========== PHASE 4: Extern function declarations ==========
	for (auto node : externFns)
	{
		// Skip extern functions that are provided by string_builtins.h
		std::string funcName = node->value;
		if (funcName.find("string_") == 0)
			continue;

		ss << "extern ";
		ss << mapType(node->inferredType) << " " << funcName << "(";
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			std::string paramType = mapType(node->children[i]->inferredType);
			std::string paramName = node->children[i]->value;
			ss << paramType << " " << paramName;
		}
		ss << ");\n";
	}
	if (!externFns.empty())
		ss << "\n";

	// ========== PHASE 5: Function forward declarations ==========
	for (auto node : functions)
	{
		std::string funcName = node->value;
		if (funcName == "main")
			funcName = "tuff_main";

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
		ss << mapType(node->inferredType) << " " << funcName << "(";
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			std::string paramType = mapType(node->children[i]->inferredType);
			std::string paramName = node->children[i]->value;
			
			// Check if this is a function pointer type
			if (isFunctionPointerType(node->children[i]->inferredType))
			{
				ss << formatFunctionPointerParam(paramType, paramName);
			}
			else
			{
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
		}
		ss << ");\n";
	}

	return ss.str();
}
