#include "codegen_cpp.h"
#include <sstream>

std::string CodeGeneratorCPP::generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType)
{
	// Helper to check if a node is a statement (vs expression)
	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT ||
					 type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT ||
					 type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT ||
					 type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK ||
					 type == ASTNodeType::RETURN_STMT;
	};

	std::stringstream ss;
	ss << "{\n";

	// Push new scope for function body
	ScopeCPP funcScope;
	scopes.push_back(funcScope);

	for (size_t i = 0; i < block->children.size(); i++)
	{
		auto child = block->children[i];

		// If this is the last child and it's an expression (not a statement),
		// and the function has a non-void return type, add implicit return
		if (i == block->children.size() - 1 && !isStatement(child->type) && returnType != "Void")
		{
			// Inject destructor calls before implicit return
			ScopeCPP &currentScope = scopes.back();
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
			ss << "  return " << generateNode(child) << ";\n";
		}
		else
		{
			ss << "  " << generateNode(child) << ";\n";
		}
	}

	// Pop scope (destructor calls already injected for implicit return)
	// For explicit returns, the destructor calls are injected by RETURN_STMT case
	ScopeCPP &currentScope = scopes.back();
	// If last statement was not a return/expression, inject destructor calls
	if (!block->children.empty())
	{
		auto lastChild = block->children.back();
		if (isStatement(lastChild->type) && lastChild->type != ASTNodeType::RETURN_STMT)
		{
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
		}
	}
	scopes.pop_back();

	ss << "}";
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
