#include "codegen_cpp.h"
#include <sstream>
#include <set>
#include <map>
#include <functional>

std::string CodeGeneratorCPP::generateSharedHeader(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;

	// Header guard
	ss << "#pragma once\n\n";

	// Standard includes
	ss << "#include <cstdint>\n";
	ss << "#include <cstddef>\n";
	ss << "#include <string>\n\n";

	// Collect all union types
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

	// Generate union struct forward declarations
	for (const auto &unionType : unionTypes)
	{
		ss << generateUnionStruct(unionType) << "\n";
	}

	// Generate enum declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::ENUM_DECL)
		{
			ss << generateNode(child) << "\n";
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

	// Note: extern function declarations are not emitted - they are provided by external libraries
	// The extern keyword in Tuff is like TypeScript declarations or C headers

	// Generate type aliases
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::TYPE_ALIAS)
		{
			// Generic type alias: template<typename T, typename L> using Name = Type;
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
			ss << "using " << child->value << " = " << mapType(child->inferredType) << ";\n";
		}
	}

	// Generate function forward declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			// Rename main to tuff_main
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
				else
				{
					ss << paramType << " " << paramName;
				}
			}
			ss << ");\n";
		}
	}

	return ss.str();
}
