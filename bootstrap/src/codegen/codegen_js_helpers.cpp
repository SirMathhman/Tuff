#include "codegen_js.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorJS::generateModuleDecl(std::shared_ptr<ASTNode> node)
{
	// Check if module has any content that needs code generation
	bool hasContent = false;
	for (auto child : node->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL ||
				child->type == ASTNodeType::ACTUAL_DECL ||
				child->type == ASTNodeType::ENUM_DECL)
		{
			hasContent = true;
			break;
		}
	}

	// Skip empty modules (e.g., modules with only expect declarations)
	if (!hasContent)
	{
		return "";
	}

	// Generate module as a nested object namespace
	std::stringstream ss;
	std::string moduleName = node->value;

	// Split by :: for nested objects
	std::vector<std::string> parts;
	size_t pos = 0;
	while ((pos = moduleName.find("::")) != std::string::npos)
	{
		parts.push_back(moduleName.substr(0, pos));
		moduleName = moduleName.substr(pos + 2);
	}
	parts.push_back(moduleName);

	// Generate the namespace object
	ss << "const " << parts[0] << " = { ";
	for (size_t i = 1; i < parts.size(); i++)
	{
		ss << parts[i] << ": { ";
	}

	// Generate module body (enums, structs, and functions as members)
	bool first = true;
	for (auto child : node->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			if (!first)
				ss << ", ";
			ss << child->value << ": " << generateNode(child);
			first = false;
		}
		else if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			if (!first)
				ss << ", ";
			// Generate actual as a function property
			ss << child->value << ": ";
			// Generate function body (same as ACTUAL_DECL case)
			ss << "function(";
			bool firstParam = true;
			for (auto param : child->children)
			{
				if (param->type == ASTNodeType::IDENTIFIER)
				{
					if (!firstParam)
						ss << ", ";
					ss << param->value;
					firstParam = false;
				}
			}
			ss << ") ";
			// Find and generate body
			for (auto bodyChild : child->children)
			{
				if (bodyChild->type != ASTNodeType::IDENTIFIER)
				{
					if (bodyChild->type == ASTNodeType::BLOCK)
					{
						ss << generateFunctionBlock(bodyChild, child->inferredType);
					}
					else if (bodyChild->type == ASTNodeType::RETURN_STMT)
					{
						// Body is already a return statement
						ss << "{ " << generateNode(bodyChild) << "; }";
					}
					else if (child->inferredType != "Void")
					{
						ss << "{ return " << generateNode(bodyChild) << "; }";
					}
					else
					{
						ss << "{ " << generateNode(bodyChild) << "; }";
					}
					break;
				}
			}
			first = false;
		}
		else if (child->type == ASTNodeType::ENUM_DECL)
		{
			if (!first)
				ss << ", ";
			// Generate enum as object property: EnumName: { Variant1: 0, ... }
			ss << child->value << ": { ";
			for (size_t i = 0; i < child->children.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << child->children[i]->value << ": " << i;
			}
			ss << " }";
			first = false;
		}
		else if (child->type == ASTNodeType::STRUCT_DECL)
		{
			// Structs don't need runtime declaration in JS, skip
		}
	}

	// Close all nested braces: } } }
	ss << " }";
	for (size_t i = 1; i < parts.size(); i++)
	{
		ss << " }";
	}
	ss << ";";

	return ss.str();
}

std::string CodeGeneratorJS::generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType)
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
	Scope funcScope;
	scopes.push_back(funcScope);

	for (size_t i = 0; i < block->children.size(); i++)
	{
		auto child = block->children[i];

		// If this is the last child and it's an expression (not a statement),
		// and the function has a non-void return type, add implicit return
		if (i == block->children.size() - 1 && !isStatement(child->type) && returnType != "Void")
		{
			// Inject destructor calls before implicit return
			Scope &currentScope = scopes.back();
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
	Scope &currentScope = scopes.back();
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

bool CodeGeneratorJS::isUnionType(const std::string &type)
{
	return type.find('|') != std::string::npos;
}

std::string CodeGeneratorJS::wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType)
{
	// If target is not a union, no wrapping needed
	if (!isUnionType(targetType))
		return value;

	// If value type matches target exactly, no wrapping needed
	if (valueType == targetType)
		return value;

	// Wrap the value: {__tag: "ValueType", __value: value}
	return "{__tag: \"" + valueType + "\", __value: " + value + "}";
}

std::string CodeGeneratorJS::getDestructor(const std::string &type)
{
	// Check if the type contains a destructor component (~Destructor)
	// Type format: "DataType&~Destructor" or "A&B&~Destructor"
	size_t pos = type.find("~");
	if (pos != std::string::npos)
	{
		// Extract destructor name (everything after ~ until next & or end)
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
std::string CodeGeneratorJS::generateActualDecl(std::shared_ptr<ASTNode> node)
{
	// Generate actual as a normal function declaration
	std::stringstream ss;
	ss << "function " << node->value << "(";

	// Parameters
	size_t paramIdx = 0;
	for (auto param : node->children)
	{
		if (param->type == ASTNodeType::IDENTIFIER)
		{
			if (paramIdx > 0)
				ss << ", ";
			ss << param->value;
			paramIdx++;
		}
	}
	ss << ") ";

	// Find body (last child that's not an IDENTIFIER)
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
