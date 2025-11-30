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
			if (type != init->inferredType)
			{
				std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << type << ", got " << init->inferredType << std::endl;
				exit(1);
			}
		}

		symbolTable[name] = {type, node->isMutable};
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

		if (lhs->inferredType != value->inferredType)
		{
			std::cerr << "Error: Type mismatch in assignment. Expected " << lhs->inferredType << ", got " << value->inferredType << std::endl;
			exit(1);
		}
		break;
	}

	case ASTNodeType::IDENTIFIER:
	{
		std::string name = node->value;

		// First check if it's an FQN reference
		if (enumTable.find(name) != enumTable.end())
		{
			node->inferredType = name; // Type is the enum name itself (possibly with FQN)
			break;
		}

		// Check if it's a local variable/parameter in symbol table
		auto it = symbolTable.find(name);
		if (it != symbolTable.end())
		{
			node->inferredType = it->second.type;
			break;
		}

		// If not found and we're in a module context, try prefixing with module name
		if (!currentModule.empty())
		{
			std::string fqn = currentModule + "::" + name;
			if (enumTable.find(fqn) != enumTable.end())
			{
				node->value = fqn; // Update to FQN
				node->inferredType = fqn;
				break;
			}
		}

		// Try imported modules
		bool foundImported = false;
		for (const auto &imported : importedModules)
		{
			std::string fqn = imported + "::" + name;
			if (enumTable.find(fqn) != enumTable.end())
			{
				node->value = fqn; // Update to FQN
				node->inferredType = fqn;
				foundImported = true;
				break;
			}
		}
		if (foundImported)
			break;

		// If still not found, error
		std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
		exit(1);
	}

	case ASTNodeType::LITERAL:
		// Type already set by parser (e.g., I32)
		break;

	case ASTNodeType::BINARY_OP:
		checkBinaryOp(node);
		break;

	case ASTNodeType::UNARY_OP:
	{
		auto operand = node->children[0];
		check(operand);

		std::string op = node->value;
		if (op == "!")
		{
			if (operand->inferredType != "Bool")
			{
				std::cerr << "Error: Operand of '!' must be Bool, got " << operand->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = "Bool";
		}
		else if (op == "-")
		{
			if (!isNumericType(operand->inferredType))
			{
				std::cerr << "Error: Operand of '-' must be numeric, got " << operand->inferredType << std::endl;
				exit(1);
			}
			node->inferredType = operand->inferredType;
		}
		break;
	}

	case ASTNodeType::IF_STMT:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto thenBranch = node->children[1];
		check(thenBranch);

		if (node->children.size() > 2)
		{
			auto elseBranch = node->children[2];
			check(elseBranch);
		}
		break;
	}

	case ASTNodeType::IF_EXPR:
	{
		auto condition = node->children[0];
		check(condition);
		if (condition->inferredType != "Bool")
		{
			std::cerr << "Error: If condition must be Bool, got " << condition->inferredType << std::endl;
			exit(1);
		}

		auto thenBranch = node->children[1];
		auto elseBranch = node->children[2];
		check(thenBranch);
		check(elseBranch);

		// For now, just use the then branch type (union types deferred)
		// TODO: Implement proper union type merging (e.g., 100I32 | 200I32)
		if (thenBranch->inferredType == elseBranch->inferredType)
		{
			node->inferredType = thenBranch->inferredType;
		}
		else
		{
			// Simplified: use the then branch type for now
			// In full implementation, this would be a union type
			node->inferredType = thenBranch->inferredType;
		}
		break;
	}

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
		for (auto child : node->children)
		{
			check(child);
		}
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

	case ASTNodeType::EXPECT_DECL:
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
			symbolTable[paramName] = {paramType, false}; // parameters are immutable
		}

		// Type check function body (last child)
		auto body = node->children.back();
		check(body);

		// Restore symbol table
		symbolTable = savedSymbolTable;
		// Restore generic params
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
			if (expr->inferredType != currentFunctionReturnType)
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

	default:
		break;
	}
}
