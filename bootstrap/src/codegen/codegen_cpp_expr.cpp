#include "codegen_cpp.h"
#include <sstream>
#include <vector>
#include <iostream>

std::string CodeGeneratorCPP::generateBinaryOp(std::shared_ptr<ASTNode> node)
{
	auto left = generateNode(node->children[0]);
	auto right = generateNode(node->children[1]);

	// Warn if adding 0
	if (node->value == "+")
	{
		// Check if either operand is the literal 0
		if (node->children[0]->type == ASTNodeType::LITERAL && node->children[0]->value == "0")
		{
			std::cerr << "Warning: Adding 0 on the left side" << std::endl;
		}
		else if (node->children[1]->type == ASTNodeType::LITERAL && node->children[1]->value == "0")
		{
			std::cerr << "Warning: Adding 0 on the right side" << std::endl;
		}
	}

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

	// Check if extern
	bool isExtern = node->calleeIsExtern;

	// First child is callee (IDENTIFIER)
	ss << generateNode(node->children[0]);

	// Emit generic args <I32>
	if (!isExtern && !node->children[0]->genericArgs.empty())
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

	// If extern and generic, we might need a cast because C++ extern functions don't have templates
	// and return types might be void* (like malloc) while Tuff expects concrete types.
	if (isExtern && !node->children[0]->genericArgs.empty())
	{
		std::string call = ss.str();
		std::string targetType = mapType(node->inferredType);
		return "((" + targetType + ")" + call + ")";
	}

	return ss.str();
}

std::string CodeGeneratorCPP::generateIfExpr(std::shared_ptr<ASTNode> node)
{
	// If this is a Void expression, generate as if statement
	if (node->inferredType == "Void" || node->inferredType.empty())
	{
		std::stringstream ss;
		ss << "if (" << generateNode(node->children[0]) << ") ";
		ss << generateNode(node->children[1]);
		if (node->children.size() > 2)
		{
			ss << " else ";
			ss << generateNode(node->children[2]);
		}
		return ss.str();
	}

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

std::string CodeGeneratorCPP::generateMatchExpr(std::shared_ptr<ASTNode> node)
{
	// Match expression compiles to nested ternary operators or switch
	// For union types, we use tag-based dispatch
	// For enum types, we use enum value comparison

	auto scrutinee = node->children[0];
	std::string scrutineeExpr = generateNode(scrutinee);
	std::string scrutineeType = scrutinee->inferredType;

	// Check if it's a union type (contains |)
	bool isUnion = isUnionType(scrutineeType);

	std::stringstream ss;

	if (isUnion)
	{
		// Generate nested ternary: (x.__tag == Tag_*::A ? bodyA : (x.__tag == Tag_*::B ? bodyB : ...))
		std::string tagName = getUnionTagName(scrutineeType);

		// Process arms (children[1..n])
		std::string defaultBody;
		std::vector<std::pair<std::string, std::string>> patternBodies; // pattern -> body

		for (size_t i = 1; i < node->children.size(); i++)
		{
			auto arm = node->children[i];
			std::string pattern = arm->value;

			std::string body;
			if (arm->children[0]->type == ASTNodeType::BLOCK)
			{
				body = generateFunctionBlock(arm->children[0], node->inferredType, true);
			}
			else
			{
				body = generateNode(arm->children[0]);
			}

			if (pattern == "_")
			{
				defaultBody = body;
			}
			else
			{
				// Extract base name from pattern (e.g., "Some" from "Some<I32>")
				std::string baseName = pattern;
				size_t pos = baseName.find('<');
				if (pos != std::string::npos)
				{
					baseName = baseName.substr(0, pos);
				}
				patternBodies.push_back({baseName, body});
			}
		}

		// Build nested ternary
		ss << "(";
		for (size_t i = 0; i < patternBodies.size(); i++)
		{
			if (i > 0)
				ss << " : ";
			ss << "(" << scrutineeExpr << ".__tag == " << tagName << "::" << patternBodies[i].first << ") ? " << patternBodies[i].second;
		}

		if (!defaultBody.empty())
		{
			ss << " : " << defaultBody;
		}
		else if (!patternBodies.empty())
		{
			// Should not happen if exhaustive, but add fallback
			ss << " : " << patternBodies.back().second;
		}

		ss << ")";
	}
	else
	{
		// Enum type - generate nested ternary with enum comparison
		std::string defaultBody;
		std::vector<std::pair<std::string, std::string>> patternBodies;

		for (size_t i = 1; i < node->children.size(); i++)
		{
			auto arm = node->children[i];
			std::string pattern = arm->value;

			std::string body;
			if (arm->children[0]->type == ASTNodeType::BLOCK)
			{
				body = generateFunctionBlock(arm->children[0], node->inferredType, true);
			}
			else
			{
				body = generateNode(arm->children[0]);
			}

			if (pattern == "_")
			{
				defaultBody = body;
			}
			else
			{
				// Handle enum patterns: Color.Red -> Color::Red
				std::string enumPattern = pattern;
				size_t dotPos = enumPattern.find('.');
				if (dotPos != std::string::npos)
				{
					enumPattern = enumPattern.substr(0, dotPos) + "::" + enumPattern.substr(dotPos + 1);
				}
				else
				{
					// Pattern is just variant name, prefix with scrutinee type
					enumPattern = scrutineeType + "::" + pattern;
				}
				patternBodies.push_back({enumPattern, body});
			}
		}

		// Build nested ternary
		ss << "(";
		for (size_t i = 0; i < patternBodies.size(); i++)
		{
			if (i > 0)
				ss << " : ";
			ss << "(" << scrutineeExpr << " == " << patternBodies[i].first << ") ? " << patternBodies[i].second;
		}

		if (!defaultBody.empty())
		{
			ss << " : " << defaultBody;
		}
		else if (!patternBodies.empty())
		{
			ss << " : " << patternBodies.back().second;
		}

		ss << ")";
	}

	return ss.str();
}
