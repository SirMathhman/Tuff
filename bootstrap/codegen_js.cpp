#include "codegen_js.h"
#include <sstream>

std::string CodeGeneratorJS::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	// For Node.js, we can just emit statements.
	// If the last node is an expression, we wrap it in process.exit()
	// Convert booleans to numbers (true=1, false=0) for exit code compatibility

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];
		if (i == ast->children.size() - 1)
		{
			// Last node: return its value (converted to number if bool)
			std::string exitCode = generateNode(child);
			if (child->inferredType == "Bool")
			{
				exitCode = "(" + exitCode + " ? 1 : 0)";
			}
			ss << "process.exit(" << exitCode << ");\n";
		}
		else
		{
			ss << generateNode(child) << ";\n";
		}
	}
	return ss.str();
}

std::string CodeGeneratorJS::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string keyword = node->isMutable ? "let" : "const";
		return keyword + " " + node->value + " = " + generateNode(node->children[0]);
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
