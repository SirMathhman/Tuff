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

	// Collect struct field information
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

	// Collect intersection types
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

	// Filter intersection types
	std::set<std::string> filteredIntersectionTypes;
	std::set<std::string> externTypes = {"NativeString"};

	for (const auto &intersectionType : intersectionTypes)
	{
		auto components = splitIntersectionType(intersectionType);
		bool isExternWithDestructor = false;

		if (components.size() == 2)
		{
			bool hasExternType = false;
			bool hasDestructor = false;

			for (const auto &comp : components)
			{
				if (!comp.empty() && comp[0] == '~')
					hasDestructor = true;
				else if (externTypes.count(comp) > 0)
					hasExternType = true;
			}

			if (hasExternType && hasDestructor)
				isExternWithDestructor = true;
		}

		if (!isExternWithDestructor)
			filteredIntersectionTypes.insert(intersectionType);
	}

	// Generate intersection struct definitions
	for (const auto &intersectionType : filteredIntersectionTypes)
	{
		ss << generateIntersectionStruct(intersectionType, structFields) << "\n";
	}

	// Generate struct declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::STRUCT_DECL)
		{
			ss << generateNode(child) << "\n";
		}
	}

	// Generate extern function declarations
	ss << "// Extern function declarations\n";
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::EXTERN_FN_DECL)
		{
			// Skip standard C library functions to avoid conflicts
			std::string funcName = child->value;
			if (funcName == "malloc" || funcName == "free" || funcName == "exit")
			{
				continue;
			}

			// Check if this is a generic extern function
			if (!child->genericParams.empty())
			{
				// Generic extern functions need template wrappers
				ss << "template<";
				for (size_t i = 0; i < child->genericParams.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << "typename " << child->genericParams[i]->value;
				}
				ss << ">\n";
				ss << "extern " << mapType(child->inferredType) << " " << child->value << "(";
				for (size_t i = 0; i < child->children.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << mapType(child->children[i]->inferredType);
				}
				ss << ");\n";
			}
			else
			{
				// Non-generic extern functions use extern "C"
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
	}
	ss << "\n";

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
