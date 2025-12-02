#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
		return generateLetStmt(node);
	case ASTNodeType::ASSIGNMENT_STMT:
		return generateAssignmentStmt(node);
	case ASTNodeType::IF_STMT:
		return generateIfStmt(node);
	case ASTNodeType::IF_EXPR:
		return generateIfExpr(node);
	case ASTNodeType::WHILE_STMT:
		return generateWhileStmt(node);
	case ASTNodeType::LOOP_STMT:
		return generateLoopStmt(node);
	case ASTNodeType::BREAK_STMT:
		return generateBreakStmt(node);
	case ASTNodeType::CONTINUE_STMT:
		return generateContinueStmt(node);
	case ASTNodeType::BLOCK:
	{
		std::stringstream ss;

		// If block is used as expression (has a type), we need to use statement expression or lambda
		// C++ statement expressions are a GCC extension ({ ...; val; })
		// Standard C++ requires lambda: [&](){ ...; return val; }()
		bool isExpression = !node->inferredType.empty() && node->inferredType != "Void";

		if (isExpression)
		{
			// Use ternary operator if it's a simple if-else expression
			// But this is a block.
			// If it's a block inside an if-expression, we might need to wrap it.
			// But wait, if-expressions are handled in IF_STMT case.
			// If this block is just a standalone block expression, we use lambda.
			// However, IF_STMT generates `if (...) { ... } else { ... }` which is a statement.
			// If IF_STMT is used as expression, it should generate `(...) ? (...) : (...)`.
			// But IF_STMT case handles both.

			// Let's check IF_STMT handling first.
		}

		ss << "{\n";

		// Push new scope
		ScopeCPP newScope;
		newScope.isLoop = nextBlockIsLoop;
		nextBlockIsLoop = false;
		scopes.push_back(newScope);

		for (size_t i = 0; i < node->children.size(); i++)
		{
			auto child = node->children[i];
			std::string childCode = generateNode(child);

			// If this is the last statement and block is an expression, don't add semicolon if it's an expression
			// But in C++, blocks don't return values unless it's a function body or statement expr.
			// We rely on the parent node to handle expression-ness (e.g. function body or if-expr).
			// If this block is part of an if-expression, the parent IF_STMT should handle it.

			ss << "  " << childCode << ";\n";
		}

		// Pop scope and inject destructor calls (in reverse order)
		ScopeCPP &currentScope = scopes.back();
		for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
		{
			ss << "  " << it->destructor << "(" << it->name << ");\n";
		}
		scopes.pop_back();

		ss << "}";
		return ss.str();
	}
	case ASTNodeType::BINARY_OP:
	case ASTNodeType::IS_EXPR:
	case ASTNodeType::UNARY_OP:
	case ASTNodeType::ARRAY_LITERAL:
	case ASTNodeType::INDEX_EXPR:
	case ASTNodeType::REFERENCE_EXPR:
	case ASTNodeType::DEREF_EXPR:
	case ASTNodeType::SIZEOF_EXPR:
	case ASTNodeType::LITERAL:
	case ASTNodeType::IDENTIFIER:
	case ASTNodeType::ENUM_VALUE:
	case ASTNodeType::STRUCT_LITERAL:
	case ASTNodeType::FIELD_ACCESS:
	{
		// Use typed AST path
		auto typed = ASTConverter::toExpr(node);
		return genExpr(typed);
	}
	case ASTNodeType::MATCH_EXPR:
		return generateMatchExpr(node);
	case ASTNodeType::FUNCTION_DECL:
	{
		std::stringstream ss;
		if (!node->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < node->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << node->genericParams[i]->value;
			}
			ss << ">\n";
		}

		// For user-defined main function, rename to tuff_main to avoid clash with C++ main
		std::string funcName = node->value;
		if (funcName == "main")
			funcName = "tuff_main";

		ss << mapType(node->inferredType) << " " << funcName << "(";

		// Generate parameters (all children except last are params)
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";

			// Handle C++ array parameters: int32_t arr[10] instead of int32_t[10] arr
			std::string paramType = mapType(node->children[i]->inferredType);
			std::string paramName = node->children[i]->value;
			size_t bracketPos = paramType.find('[');
			if (bracketPos != std::string::npos)
			{
				std::string baseType = paramType.substr(0, bracketPos);
				std::string arraySuffix = paramType.substr(bracketPos);
				ss << baseType << " " << paramName << arraySuffix;
			}
			else
			{
				ss << paramType << " " << paramName;
			}
		}

		ss << ") ";
		// Last child is the body
		auto body = node->children.back();

		// If body is a block, generate it with implicit return of last expression
		if (body->type == ASTNodeType::BLOCK)
		{
			ss << generateFunctionBlock(body, node->inferredType);
		}
		else
		{
			// Single expression body - wrap in braces with return
			if (node->inferredType != "Void")
			{
				ss << "{ return " << generateNode(body) << "; }";
			}
			else
			{
				ss << "{ " << generateNode(body) << "; }";
			}
		}
		return ss.str();
	}
	case ASTNodeType::CALL_EXPR:
		return generateCallExpr(node);
	case ASTNodeType::RETURN_STMT:
		return generateReturnStmt(node);
	case ASTNodeType::STRUCT_DECL:
	{
		std::stringstream ss;
		if (!node->genericParams.empty())
		{
			ss << "template<";
			for (size_t i = 0; i < node->genericParams.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << "typename " << node->genericParams[i]->value;
			}
			ss << ">\n";
		}
		ss << "struct " << node->value << " {\n";
		for (auto field : node->children)
		{
			ss << "    " << mapType(field->inferredType) << " " << field->value << ";\n";
		}
		ss << "};";
		return ss.str();
	}
	case ASTNodeType::ENUM_DECL:
	{
		std::stringstream ss;
		ss << "enum class " << node->value << " {\n";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ",\n";
			ss << "    " << node->children[i]->value;
		}
		ss << "\n};";
		return ss.str();
	}
	case ASTNodeType::MODULE_DECL:
		return generateModuleDecl(node);
	case ASTNodeType::USE_DECL:
	{
		// Use declarations are handled at compile time for scope resolution
		// No code generation needed
		return "";
	}
	case ASTNodeType::EXPECT_DECL:
	{
		// Skip expect declarations - they have no codegen
		return "";
	}
	case ASTNodeType::ACTUAL_DECL:
		return generateActualDecl(node);
	default:
		return "";
	}
}
