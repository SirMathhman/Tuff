#include "codegen_cpp.h"
#include "ast/ast_converter.h"
#include <sstream>
#include <iostream>
#include <fstream>
#include <functional>

std::string CodeGeneratorCPP::generateForwardDeclarations(
		const std::vector<std::shared_ptr<ASTNode>> &functions,
		const std::vector<std::shared_ptr<ASTNode>> &implDecls,
		const std::vector<std::shared_ptr<ASTNode>> &actualDecls)
{
	std::stringstream ss;

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

	for (auto child : allFunctions)
	{
		std::string funcName = child->value;
		if (funcName == "main")
			funcName = "tuff_main";

		// Replace :: with _
		size_t pos = 0;
		while ((pos = funcName.find("::", pos)) != std::string::npos)
		{
			funcName.replace(pos, 2, "_");
			pos += 1;
		}

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
			if (paramName == "this")
				paramName = "this_";
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

				// Check if this is a function pointer type
				if (isFunctionPointerType(param->inferredType))
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
				paramCount++;
			}
		}
		ss << ");\n";
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
	return node->type == ASTNodeType::EXPECT_DECL ||
				 (node->type == ASTNodeType::FUNCTION_DECL && node->value == "main") ||
				 node->isExported;
}
