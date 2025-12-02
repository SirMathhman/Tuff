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
	case ASTNodeType::STRING_LITERAL:
	{
		// String literal: generate as C string with proper escaping
		std::stringstream ss;
		ss << "\"";
		for (char c : node->value)
		{
			switch (c)
			{
			case '\n':
				ss << "\\n";
				break;
			case '\r':
				ss << "\\r";
				break;
			case '\t':
				ss << "\\t";
				break;
			case '\\':
				ss << "\\\\";
				break;
			case '"':
				ss << "\\\"";
				break;
			default:
				ss << c;
				break;
			}
		}
		ss << "\"";
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

			// Rename 'this' to 'this_' for C++ (since 'this' is a C++ keyword)
			if (paramName == "this")
			{
				paramName = "this_";
			}

			size_t bracketPos = paramType.find('[');
			if (bracketPos != std::string::npos)
			{
				std::string baseType = paramType.substr(0, bracketPos);
				std::string arraySuffix = paramType.substr(bracketPos);
				ss << baseType << " " << paramName << arraySuffix;
			}
			// Handle function pointer parameters: RetType (*)(Params) -> RetType (*name)(Params)
			else if (paramType.find("(*)") != std::string::npos)
			{
				size_t funcPtrPos = paramType.find("(*)");
				std::string retType = paramType.substr(0, funcPtrPos);
				std::string params = paramType.substr(funcPtrPos + 3);
				while (!retType.empty() && retType.back() == ' ')
					retType.pop_back();
				ss << retType << " (*" << paramName << ")" << params;
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
	case ASTNodeType::ENUM_DECL:
	case ASTNodeType::USE_DECL:
	case ASTNodeType::EXPECT_DECL:
	{
		// Use typed AST path
		auto typed = ASTConverter::toDecl(node);
		return genDecl(typed);
	}
	case ASTNodeType::MODULE_DECL:
		return generateModuleDecl(node);
	case ASTNodeType::IMPL_DECL:
	{
		// Generate impl block methods as free functions with mangled names
		// Since C++ doesn't allow namespace and struct with same name,
		// we generate free functions with underscore separator: Counter_new, Counter_increment
		std::stringstream ss;

		// Extract struct name from impl node
		std::string structName;
		if (node->typeNode && !node->typeNode->value.empty())
		{
			structName = node->typeNode->value;
		}
		else if (!node->value.empty())
		{
			structName = node->value;
		}

		if (structName.empty())
		{
			// Fallback: generate without modification (shouldn't happen)
			for (auto method : node->children)
			{
				ss << generateNode(method) << "\n\n";
			}
			return ss.str();
		}

		// Generate methods with mangled names (StructName_methodName)
		for (auto method : node->children)
		{
			if (method->type == ASTNodeType::FUNCTION_DECL)
			{
				// Method name is already FQN'd like "Counter::new"
				// Replace "::" with "_" for C++ compatibility
				std::string methodName = method->value;
				std::string prefix = structName + "::";

				// Replace :: with _
				if (methodName.find(prefix) == 0)
				{
					methodName = structName + "_" + methodName.substr(prefix.length());
				}

				// Temporarily change method name and add impl generic params for generation
				std::string savedName = method->value;
				auto savedGenericParams = method->genericParams;

				method->value = methodName;

				// Prepend impl block generic params to method generic params
				std::vector<std::shared_ptr<ASTNode>> combinedParams = node->genericParams;
				for (auto param : savedGenericParams)
				{
					combinedParams.push_back(param);
				}
				method->genericParams = combinedParams;

				ss << generateNode(method) << "\n";

				// Restore original name and generic params
				method->value = savedName;
				method->genericParams = savedGenericParams;
			}
			else
			{
				ss << generateNode(method) << "\n";
			}
		}

		return ss.str();
	}
	case ASTNodeType::ACTUAL_DECL:
		return generateActualDecl(node);
	default:
		return "";
	}
}
