#include "type_checker.h"
#include <iostream>

void TypeChecker::checkFunctionDecl(std::shared_ptr<ASTNode> node)
{
	std::string funcName = node->value;
	currentFunctionReturnType = node->inferredType; // Set for return statement validation

	// Create new scope for function parameters
	std::map<std::string, SymbolInfo> savedSymbolTable = symbolTable;
	std::map<std::string, int> savedPointerOrigins = pointerOrigins;
	std::map<std::string, ExprPtr> savedNarrowedTypes = narrowedTypes;
	std::set<std::string> savedMovedVariables = movedVariables;
	int savedFunctionScopeDepth = functionScopeDepth;
	// Don't clear symbol table completely - we need to keep global symbols (like 'in let' vars)
	// But we do need to handle shadowing correctly.
	// For now, Tuff doesn't have true globals except 'in let', so we can just copy them over
	// or rely on a scope stack. The current implementation clears the table which wipes globals.

	// Filter out non-global symbols if we had any, but currently symbolTable only has locals
	// However, 'in let' variables are added to the global scope (depth 0)
	// So we should preserve them.

	// Better approach: Use a scope stack or just increment scope depth and remove locals on exit
	// But since we're using a single map, we need to be careful.
	// The current implementation assumes top-level is empty or we don't care about it inside functions.
	// But 'in let' changes that.

	// Let's preserve symbols with scopeDepth == 0
	std::map<std::string, SymbolInfo> globalSymbols;
	for (const auto &pair : symbolTable)
	{
		if (pair.second.scopeDepth == 0)
		{
			globalSymbols[pair.first] = pair.second;
		}
	}
	symbolTable = globalSymbols;
	pointerOrigins.clear();
	narrowedTypes.clear(); // Clear narrowings for new function
	movedVariables.clear(); // Clear moved variables for new function

	currentScopeDepth++;
	functionScopeDepth = currentScopeDepth; // Parameters are at function scope depth

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
		info.scopeDepth = currentScopeDepth;
		symbolTable[paramName] = info;
	}

	// Type check function body (last child)
	auto body = node->children.back();
	check(body);

	// Restore state
	currentScopeDepth--;
	symbolTable = savedSymbolTable;
	pointerOrigins = savedPointerOrigins;
	narrowedTypes = savedNarrowedTypes;
	movedVariables = savedMovedVariables;
	functionScopeDepth = savedFunctionScopeDepth;
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
	std::set<std::string> savedMovedVariables = movedVariables;
	symbolTable.clear();
	movedVariables.clear();

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
	movedVariables = savedMovedVariables;
	currentFunctionReturnType = "";
}
