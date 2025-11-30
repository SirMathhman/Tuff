#include "codegen_cpp.h"
#include <sstream>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n\n";
	
	// Determine return type from last expression
	std::string returnType = "int"; // default
	if (ast->children.size() > 0)
	{
		auto lastNode = ast->children.back();
		returnType = mapType(lastNode->inferredType);
	}
	
	ss << returnType << " main() {\n";

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];
		if (i == ast->children.size() - 1)
		{
			// Last node: return its value
			ss << "    return " << generateNode(child) << ";\n";
		}
		else
		{
			// Earlier nodes: execute for side effects (variable declarations)
			ss << "    " << generateNode(child) << ";\n";
		}
	}

	ss << "}\n";
	return ss.str();
}

std::string CodeGeneratorCPP::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string cppType = mapType(node->inferredType);
		std::string prefix = node->isMutable ? "" : "const ";
		return prefix + cppType + " " + node->value + " = " + generateNode(node->children[0]);
	}
	case ASTNodeType::ASSIGNMENT_STMT:
		return node->value + " = " + generateNode(node->children[0]);
	case ASTNodeType::BINARY_OP:
	{
		auto left = generateNode(node->children[0]);
		auto right = generateNode(node->children[1]);
		return "(" + left + " " + node->value + " " + right + ")";
	}
	case ASTNodeType::UNARY_OP:
	{
		auto operand = generateNode(node->children[0]);
		return "(" + node->value + operand + ")";
	}
	case ASTNodeType::LITERAL:
	case ASTNodeType::IDENTIFIER:
		return node->value;
	default:
		return "";
	}
}

std::string CodeGeneratorCPP::mapType(std::string tuffType)
{
	if (tuffType == "I32")
		return "int32_t";
	if (tuffType == "Bool")
		return "bool";
	return "auto"; // Fallback
}
