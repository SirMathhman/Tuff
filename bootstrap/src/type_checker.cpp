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
		checkLetStmt(node);
		break;

	case ASTNodeType::IN_LET_STMT:
		// Already checked during registration phase
		break;

	case ASTNodeType::ASSIGNMENT_STMT:
		checkAssignmentStmt(node);
		break;

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
		checkIfStmt(node);
		break;

	case ASTNodeType::IF_EXPR:
		checkIfExpr(node);
		break;

	case ASTNodeType::WHILE_STMT:
		checkWhileStmt(node);
		break;

	case ASTNodeType::LOOP_STMT:
		checkLoopStmt(node);
		break;

	case ASTNodeType::BREAK_STMT:
	case ASTNodeType::CONTINUE_STMT:
		// No type checking needed
		break;

	case ASTNodeType::BLOCK:
		checkBlock(node);
		break;

	case ASTNodeType::STRUCT_DECL:
	case ASTNodeType::ENUM_DECL:
	case ASTNodeType::TYPE_ALIAS:
	case ASTNodeType::EXPECT_DECL:
	case ASTNodeType::EXTERN_FN_DECL:
	case ASTNodeType::EXTERN_TYPE_DECL:
	case ASTNodeType::EXTERN_USE_DECL:
		// Already registered in first pass, just skip
		break;

	case ASTNodeType::MODULE_DECL:
		checkModuleDecl(node);
		break;

	case ASTNodeType::USE_DECL:
		// Record the imported module
		importedModules.push_back(node->value);
		break;

	case ASTNodeType::ACTUAL_DECL:
		checkActualDecl(node);
		break;

	case ASTNodeType::FUNCTION_DECL:
		checkFunctionDecl(node);
		break;

	case ASTNodeType::IMPL_DECL:
		checkImplBlock(node);
		break;

	case ASTNodeType::CALL_EXPR:
		checkCallExpr(node);
		break;

	case ASTNodeType::RETURN_STMT:
		checkReturnStmt(node);
		break;

	case ASTNodeType::STRUCT_LITERAL:
		checkStructLiteral(node);
		break;

	case ASTNodeType::FIELD_ACCESS:
		checkFieldOrEnumAccess(node);
		break;

	case ASTNodeType::ARRAY_LITERAL:
		checkArrayLiteral(node);
		break;

	case ASTNodeType::STRING_LITERAL:
		// String literals have type 'string'
		node->inferredType = "string";
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

	case ASTNodeType::CAST_EXPR:
		checkCastExpr(node);
		break;

	default:
		break;
	}
}

void TypeChecker::checkImplBlock(std::shared_ptr<ASTNode> node)
{
	// Extract struct name from impl typeNode
	// For Vector<T>, typeNode->value is "Vector"
	std::string structName;
	if (node->typeNode && !node->typeNode->value.empty())
	{
		structName = node->typeNode->value;
	}
	else if (!node->value.empty())
	{
		structName = node->value;
	}

	// Verify struct exists
	auto structIt = structTable.find(structName);
	bool found = (structIt != structTable.end());

	if (!found)
	{
		auto aliasIt = typeAliasTable.find(structName);
		if (aliasIt != typeAliasTable.end())
		{
			found = true;
		}
	}

	// Allow primitive types
	if (!found && (structName == "I32" || structName == "USize" || structName == "Bool" || structName == "string"))
	{
		found = true;
	}

	if (!found)
	{
		std::cerr << "Error: Struct or Type Alias '" << structName << "' not found when checking impl block." << std::endl;
		std::cerr << "Available structs:" << std::endl;
		for (const auto &pair : structTable)
		{
			std::cerr << "  - " << pair.first << std::endl;
		}
		std::cerr << "Available aliases:" << std::endl;
		for (const auto &pair : typeAliasTable)
		{
			std::cerr << "  - " << pair.first << std::endl;
		}
		exit(1);
	}

	// Save and add impl block's generic params to scope
	// e.g., impl<T> Vector<T> { ... } - T should be in scope for all methods
	std::vector<std::string> savedGenericParams = genericParamsInScope;
	for (auto genParam : node->genericParams)
	{
		genericParamsInScope.push_back(genParam->value);
	}

	// For each method in the impl block
	for (auto method : node->children)
	{
		if (method->type != ASTNodeType::FUNCTION_DECL)
		{
			std::cerr << "Error: Expected function declaration in impl block." << std::endl;
			exit(1);
		}

		// Methods are already registered with FQN names by registerDeclarations
		// Just check them as normal functions
		check(method);
	}

	// Restore generic params scope
	genericParamsInScope = savedGenericParams;
}
