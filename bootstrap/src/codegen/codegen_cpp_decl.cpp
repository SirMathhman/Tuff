#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateModuleDecl(std::shared_ptr<ASTNode> node)
{
	// Generate module as C++ namespace
	// e.g., module math { fn add(...) } becomes:
	// namespace math { type add(...) { ... } }
	std::stringstream ss;
	std::string moduleName = node->value;

	// Split by :: for nested namespaces
	size_t pos = 0;
	std::vector<std::string> parts;
	while ((pos = moduleName.find("::")) != std::string::npos)
	{
		parts.push_back(moduleName.substr(0, pos));
		moduleName = moduleName.substr(pos + 2);
	}
	parts.push_back(moduleName);

	// Generate opening namespaces
	for (const auto &part : parts)
	{
		ss << "namespace " << part << " {\n";
	}

	// Generate module body
	for (auto child : node->children)
	{
		ss << generateNode(child) << "\n";
	}

	// Generate closing braces for namespaces
	for (size_t i = 0; i < parts.size(); i++)
	{
		ss << "}";
		if (i < parts.size() - 1)
			ss << " ";
	}

	return ss.str();
}

std::string CodeGeneratorCPP::generateActualDecl(std::shared_ptr<ASTNode> node)
{
	// Generate actual as a normal function
	std::stringstream ss;
	ss << mapType(node->inferredType) << " " << node->value << "(";

	// Parameters
	size_t paramIdx = 0;
	for (auto param : node->children)
	{
		if (param->type == ASTNodeType::IDENTIFIER)
		{
			if (paramIdx > 0)
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
			paramIdx++;
		}
	}
	ss << ") ";

	// Find body
	for (auto child : node->children)
	{
		if (child->type != ASTNodeType::IDENTIFIER)
		{
			if (child->type == ASTNodeType::BLOCK)
			{
				ss << generateNode(child);
			}
			else if (child->type == ASTNodeType::RETURN_STMT)
			{
				// RETURN_STMT already includes "return " so wrap it directly
				ss << "{ " << generateNode(child) << "; }";
			}
			break;
		}
	}

	return ss.str();
}
