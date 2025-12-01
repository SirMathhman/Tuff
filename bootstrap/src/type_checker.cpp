#include "type_checker.h"
#include <iostream>

void TypeChecker::check(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::PROGRAM:
		registerDeclarations(node);
		// Second pass: type check all nodes
		for (auto child : node->children)
		{
			check(child);
		}
		break;

	case ASTNodeType::LET_STMT:
	{
		std::string name = node->value;
		if (symbolTable.find(name) != symbolTable.end())
		{
			std::cerr << "Error: Variable '" << name << "' already declared (no shadowing allowed)." << std::endl;
			exit(1);
		}

		auto init = node->children[0];
		check(init);

		std::string type = node->inferredType;
		if (type == "Inferred")
		{
			type = init->inferredType;
			node->inferredType = type; // Update AST with inferred type
		}
		else
		{
			// Expand type aliases in the declared type
			type = expandTypeAlias(type);
			node->inferredType = type;

			if (!isTypeCompatible(init->inferredType, type))
			{
				std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << type << ", got " << init->inferredType << std::endl;
				exit(1);
			}
		}

		SymbolInfo info;
		info.type = type;
		info.isMutable = node->isMutable;
		symbolTable[name] = info;
		break;
	}

	case ASTNodeType::ASSIGNMENT_STMT:
	{
		// Check if it's a field assignment or simple variable assignment
		auto lhs = node->children[0];
		auto value = node->children[1];

		check(lhs); // This will set the inferred type of lhs
		check(value);

		// For field access, lhs already has its type checked
		// For simple identifier, check mutability
		if (lhs->type == ASTNodeType::IDENTIFIER)
		{
			std::string name = lhs->value;
			auto it = symbolTable.find(name);
			if (it == symbolTable.end())
			{
				std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
				exit(1);
			}

			if (!it->second.isMutable)
			{
				std::cerr << "Error: Cannot assign to immutable variable '" << name << "'." << std::endl;
				exit(1);
			}
		}

		// Validate type compatibility
		if (!isTypeCompatible(value->inferredType, lhs->inferredType))
		{
			std::cerr << "Error: Type mismatch in assignment. Expected " << lhs->inferredType << ", got " << value->inferredType << std::endl;
			exit(1);
		}
		break;
	}

	case ASTNodeType::IDENTIFIER:
		checkIdentifier(node);
		break;

	case ASTNodeType::LITERAL:
		// Type already set by parser (e.g., I32)
		break;

	case ASTNodeType::BINARY_OP:
		checkBinaryOp(node);
		break;

	case ASTNodeType::IS_EXPR:
		checkIsExpr(node);
		break;

	case ASTNodeType::MATCH_EXPR:
		checkMatchExpr(node);
		break;

	case ASTNodeType::UNARY_OP:
		checkUnaryOp(node);
		break;

	case ASTNodeType::IF_STMT:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		// Type narrowing: if condition is `x is SomeType`, narrow x's type in then-branch
		std::string narrowedVar;
		std::string narrowedToType;
		if (condition->type == ASTNodeType::IS_EXPR && condition->children[0]->type == ASTNodeType::IDENTIFIER)
		{
			narrowedVar = condition->children[0]->value;
			narrowedToType = condition->value; // The type we're checking against
			narrowedTypes[narrowedVar] = narrowedToType;
		}

		auto thenBranch = node->children[1];
		check(thenBranch);

		// Clear type narrowing after then-branch
		if (!narrowedVar.empty())
		{
			narrowedTypes.erase(narrowedVar);
		}

		if (node->children.size() > 2)
		{
			auto elseBranch = node->children[2];
			check(elseBranch);
		}
		break;
	}

	case ASTNodeType::IF_EXPR:
		checkIfExpr(node);
		break;

	case ASTNodeType::WHILE_STMT:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: While condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto body = node->children[1];
		check(body);
		break;
	}

	case ASTNodeType::LOOP_STMT:
	{
		auto body = node->children[0];
		check(body);
		break;
	}

	case ASTNodeType::BREAK_STMT:
	case ASTNodeType::CONTINUE_STMT:
		// No type checking needed
		break;

	case ASTNodeType::BLOCK:
	{
		// Create new scope for block
		auto savedSymbols = symbolTable;
		currentScopeDepth++;

		for (auto child : node->children)
		{
			check(child);
		}

		// If block is used as expression, its type is the type of the last statement
		if (!node->children.empty())
		{
			auto lastChild = node->children.back();
			if (!lastChild->inferredType.empty() && lastChild->inferredType != "Void")
			{
				node->inferredType = lastChild->inferredType;
			}
			else
			{
				node->inferredType = "Void";
			}
		}
		else
		{
			node->inferredType = "Void";
		}

		currentScopeDepth--;

		// Restore scope after block
		symbolTable = savedSymbols;
		break;
	}

	case ASTNodeType::STRUCT_DECL:
	{
		// Already registered in first pass, just skip
		break;
	}

	case ASTNodeType::ENUM_DECL:
	{
		// Already registered in first pass, just skip
		break;
	}

	case ASTNodeType::TYPE_ALIAS:
	{
		// Already registered in first pass, just skip
		break;
	}

	case ASTNodeType::MODULE_DECL:
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
		break;
	}

	case ASTNodeType::USE_DECL:
	{
		// Record the imported module
		importedModules.push_back(node->value);
		break;
	}

	case ASTNodeType::USE_EXTERN_DECL:
	{
		// External include - no type checking needed, just record
		// The code generator will emit #include <name.h>
		break;
	}

	case ASTNodeType::EXTERN_TYPE_DECL:
	{
		// External type declaration - register as an opaque type
		// No type checking needed, just record that it exists
		break;
	}

	case ASTNodeType::EXPECT_DECL:
	{
		// Already registered in first pass, no body to check
		break;
	}

	case ASTNodeType::EXTERN_FN_DECL:
	{
		// Already registered in first pass, no body to check
		break;
	}

	case ASTNodeType::ACTUAL_DECL:
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
				symbolTable[paramName] = {paramType, false};
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
		break;
	}

	case ASTNodeType::FUNCTION_DECL:
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
		break;
	}

	case ASTNodeType::CALL_EXPR:
		checkCallExpr(node);
		break;

	case ASTNodeType::RETURN_STMT:
	{
		if (currentFunctionReturnType.empty())
		{
			std::cerr << "Error: Return statement outside of function." << std::endl;
			exit(1);
		}

		if (node->children.empty())
		{
			// return; with no value
			if (currentFunctionReturnType != "Void")
			{
				std::cerr << "Error: Function expects return type " << currentFunctionReturnType
									<< ", but got void return." << std::endl;
				exit(1);
			}
		}
		else
		{
			// return expr;
			auto expr = node->children[0];
			check(expr);
			if (!isTypeCompatible(expr->inferredType, currentFunctionReturnType))
			{
				std::cerr << "Error: Function expects return type " << currentFunctionReturnType
									<< ", but got " << expr->inferredType << std::endl;
				exit(1);
			}
		}
		break;
	}

	case ASTNodeType::STRUCT_LITERAL:
		checkStructLiteral(node);
		break;

	case ASTNodeType::FIELD_ACCESS:
		checkFieldOrEnumAccess(node);
		break;

	case ASTNodeType::ARRAY_LITERAL:
		checkArrayLiteral(node);
		break;

	case ASTNodeType::INDEX_EXPR:
		checkIndexExpr(node);
		break;

	case ASTNodeType::REFERENCE_EXPR:
		checkReferenceExpr(node);
		break;

	case ASTNodeType::DEREF_EXPR:
		checkDerefExpr(node);
		break;

	case ASTNodeType::SIZEOF_EXPR:
		checkSizeOfExpr(node);
		break;

	default:
		break;
	}
}
