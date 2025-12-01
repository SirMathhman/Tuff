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

	for (size_t i = 0; i < block->children.size(); i++)
	{
		auto child = block->children[i];
		
		// If this is the last statement and block is an expression
		if (isExpression && i == block->children.size() - 1)
		{
			// If it's a return statement, just generate it
			if (child->type == ASTNodeType::RETURN_STMT)
			{
				ss << "  " << generateNode(child) << ";\n";
			}
			else
			{
				// Implicit return
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
	
	// If not expression, or if expression but empty block (shouldn't happen for valid expr)
	if (!isExpression)
	{
		// Pop scope and inject destructor calls (in reverse order)
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
