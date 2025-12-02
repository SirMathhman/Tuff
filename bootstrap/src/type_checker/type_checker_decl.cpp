#include "type_checker.h"
#include <iostream>

void TypeChecker::checkFunctionDecl(std::shared_ptr<ASTNode> node)
{
	std::string funcName = node->value;
	currentFunctionReturnType = node->inferredType; // Set for return statement validation

	// Create new scope for function parameters
	std::map<std::string, SymbolInfo> savedSymbolTable = symbolTable;
	symbolTable.clear();
	currentScopeDepth++;

	// Save generic params scope
	std::vector<std::string> savedGenericParams = genericParamsInScope;

	// Add generic params to scope
	for (auto genParam : node->genericParams)
	{
		genericParamsInScope.push_back(genParam->value);
	}

	// Add parameters to symbol table (immutable)
	for (size_t i = 0; i < node->children.size() - 1; i++)
	{
		auto paramNode = node->children[i];
		std::string paramName = paramNode->value;
		std::string paramType = paramNode->inferredType;
		SymbolInfo info;
		info.type = paramType;
		info.isMutable = false;
		symbolTable[paramName] = info;
	}

	// Type check function body (last child)
	auto body = node->children.back();
	check(body);

	// Restore state
	currentScopeDepth--;
	symbolTable = savedSymbolTable;
	genericParamsInScope = savedGenericParams;

	currentFunctionReturnType = ""; // Clear for safety
}

void TypeChecker::checkModuleDecl(std::shared_ptr<ASTNode> node)
{
	// Save current module and switch context
	std::string savedModule = currentModule;
	currentModule = node->value;

	// Type check all statements inside the module
	for (auto child : node->children)
	{
		check(child);
	}

	// Restore previous module context
	currentModule = savedModule;
}

void TypeChecker::checkActualDecl(std::shared_ptr<ASTNode> node)
{
	std::string funcName = node->value;
	currentFunctionReturnType = node->inferredType;

	// Create new scope for function parameters
	std::map<std::string, SymbolInfo> savedSymbolTable = symbolTable;
	symbolTable.clear();

	// Add parameters to symbol table
	for (size_t i = 0; i < node->children.size(); i++)
	{
		auto paramNode = node->children[i];
		if (paramNode->type == ASTNodeType::IDENTIFIER)
		{
			std::string paramName = paramNode->value;
			std::string paramType = paramNode->inferredType;
			symbolTable[paramName] = {paramType, nullptr, false};
		}
	}

	// Check function body (last child is the body/return statement)
	if (!node->children.empty())
	{
		auto lastChild = node->children.back();
		if (lastChild->type == ASTNodeType::RETURN_STMT || lastChild->type == ASTNodeType::BLOCK)
		{
			check(lastChild);
		}
	}

	// Restore symbol table
	symbolTable = savedSymbolTable;
	currentFunctionReturnType = "";
}
