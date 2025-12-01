#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType, bool isExpression)
{
	std::stringstream ss;

	if (isExpression)
	{
		// Generate lambda for block expression
		// [&]() -> ReturnType { ...; return val; }()
		ss << "[&]() -> " << mapType(returnType) << " {\n";
	}
	else
	{
		ss << "{\n";
	}

	// Push new scope
	ScopeCPP newScope;
	newScope.isLoop = nextBlockIsLoop;
	nextBlockIsLoop = false;
	scopes.push_back(newScope);

	// Determine if we need to add implicit return for the last statement
	// This applies to both lambda expressions and function bodies with non-void return type
	bool needsImplicitReturn = !returnType.empty() && returnType != "Void";

	for (size_t i = 0; i < block->children.size(); i++)
	{
		auto child = block->children[i];

		// If this is the last statement and we might need implicit return
		if (needsImplicitReturn && i == block->children.size() - 1)
		{
			// If it's a return statement, just generate it
			if (child->type == ASTNodeType::RETURN_STMT)
			{
				ss << "  " << generateNode(child) << ";\n";
			}
			// Skip implicit return for statements (let, assignment, control flow)
			else if (child->type == ASTNodeType::LET_STMT ||
							 child->type == ASTNodeType::ASSIGNMENT_STMT ||
							 child->type == ASTNodeType::WHILE_STMT ||
							 child->type == ASTNodeType::LOOP_STMT ||
							 child->type == ASTNodeType::BREAK_STMT ||
							 child->type == ASTNodeType::CONTINUE_STMT)
			{
				ss << "  " << generateNode(child) << ";\n";
			}
			// IF_STMT/IF_EXPR with Void type - check if branches have returns (control flow)
			// If so, don't add outer return
			else if ((child->type == ASTNodeType::IF_STMT || child->type == ASTNodeType::IF_EXPR) &&
							 (child->inferredType.empty() || child->inferredType == "Void"))
			{
				ss << "  " << generateNode(child) << ";\n";
			}
			// IF_EXPR with non-Void type generates a ternary expression, return its value
			else if (child->type == ASTNodeType::IF_EXPR || child->type == ASTNodeType::IF_STMT)
			{
				ScopeCPP &currentScope = scopes.back();
				for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
				{
					ss << "  " << it->destructor << "(" << it->name << ");\n";
				}
				ss << "  return " << generateNode(child) << ";\n";
			}
			else
			{
				// Implicit return for expression
				// Inject destructor calls before return
				ScopeCPP &currentScope = scopes.back();
				for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
				{
					ss << "  " << it->destructor << "(" << it->name << ");\n";
				}

				ss << "  return " << generateNode(child) << ";\n";
			}
		}
		else
		{
			ss << "  " << generateNode(child) << ";\n";
		}
	}

	// If not expression, inject destructor calls at block end
	if (!isExpression)
	{
		ScopeCPP &currentScope = scopes.back();
		for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
		{
			ss << "  " << it->destructor << "(" << it->name << ");\n";
		}
	}

	scopes.pop_back();

	if (isExpression)
	{
		ss << "}()";
	}
	else
	{
		ss << "}";
	}

	return ss.str();
}

std::string CodeGeneratorCPP::getDestructor(const std::string &type)
{
	// Check if the type contains a destructor component (#Destructor)
	// Type format: "DataType&#Destructor" or "A&B&#Destructor"
	size_t pos = type.find("#");
	if (pos != std::string::npos)
	{
		// Extract destructor name (everything after # until next & or end)
		std::string rest = type.substr(pos + 1);
		size_t ampPos = rest.find('&');
		if (ampPos != std::string::npos)
			return rest.substr(0, ampPos);
		return rest;
	}

	// Special case: String type needs string_destroy
	if (type == "String")
		return "string_destroy";

	return "";
}
