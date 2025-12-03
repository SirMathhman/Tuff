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
					for (char c : paramsStr) {
						if (c == ',') {
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
								for (const auto &p : typeParams) {
									if (p == currentParam) {
										found = true;
										break;
									}
								}
								if (!found) {
									typeParams.push_back(currentParam);
								}
							}
							currentParam.clear();
						} else {
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
						for (const auto &p : typeParams) {
							if (p == currentParam) {
								found = true;
								break;
							}
						}
						if (!found) {
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

	for (const auto &pair : unionStructToGeneric)
	{
		ss << generateUnionStruct(pair.second.first, pair.second.second) << "\n";
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
