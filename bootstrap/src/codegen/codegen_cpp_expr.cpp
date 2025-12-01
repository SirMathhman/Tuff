#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = generateNode(node->children[0]);
	auto right = generateNode(node->children[1]);
	return left + " " + node->value + " " + right;
}

std::string CodeGeneratorCPP::generateUnaryOp(std::shared_ptr<ASTNode> node)
{
	auto operand = generateNode(node->children[0]);
	return "(" + node->value + operand + ")";
}

std::string CodeGeneratorCPP::generateCallExpr(std::shared_ptr<ASTNode> node)
{
	std::stringstream ss;
	// First child is callee (IDENTIFIER)
	ss << generateNode(node->children[0]);

	// Emit generic args <I32>
	if (!node->children[0]->genericArgs.empty())
	{
		ss << "<";
		for (size_t i = 0; i < node->children[0]->genericArgs.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << mapType(node->children[0]->genericArgs[i]);
		}
		ss << ">";
	}

	ss << "(";

	// Remaining children are arguments
	for (size_t i = 1; i < node->children.size(); i++)
	{
		if (i > 1)
			ss << ", ";
		ss << generateNode(node->children[i]);
	}

	ss << ")";
	return ss.str();
}

std::string CodeGeneratorCPP::generateIfExpr(std::shared_ptr<ASTNode> node)
{
	std::stringstream ss;
	ss << "(" << generateNode(node->children[0]) << " ? ";

	auto thenBranch = node->children[1];
	auto elseBranch = node->children[2];

	if (thenBranch->type == ASTNodeType::BLOCK)
		ss << generateFunctionBlock(thenBranch, node->inferredType, true);
	else
		ss << generateNode(thenBranch);

	ss << " : ";

	if (elseBranch->type == ASTNodeType::BLOCK)
		ss << generateFunctionBlock(elseBranch, node->inferredType, true);
	else
		ss << generateNode(elseBranch);

	ss << ")";
	return ss.str();
}
