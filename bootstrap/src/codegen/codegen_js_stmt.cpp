#include "codegen_js.h"
#include <sstream>

std::string CodeGeneratorJS::generateStmt(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string keyword = node->isMutable ? "let" : "const";
		std::string value = generateNode(node->children[0]);
		std::string wrapped = wrapInUnion(value, node->children[0]->inferredType, node->inferredType);

		// Track variable with destructor if applicable
		std::string dtor = getDestructor(node->inferredType);
		if (!dtor.empty() && !scopes.empty())
		{
			scopes.back().vars.push_back({node->value, dtor});
		}

		return keyword + " " + node->value + " = " + wrapped;
	}
	case ASTNodeType::ASSIGNMENT_STMT:
	{
		auto lhs = node->children[0];
		auto rhs = node->children[1];
		// Handle dereference assignment: *p = x becomes p.set(x) for JS mutable refs
		if (lhs->type == ASTNodeType::DEREF_EXPR)
		{
			auto ptrExpr = lhs->children[0];
			std::string ptrType = ptrExpr->inferredType;
			// Helper to check if a pointer type is mutable (*mut T or *a mut T)
			bool isMutable = false;
			if (!ptrType.empty() && ptrType[0] == '*') {
				if (ptrType.substr(0, 5) == "*mut ") isMutable = true;
				else if (ptrType.length() > 2 && ptrType[1] >= 'a' && ptrType[1] <= 'z' && ptrType[2] == ' ') {
					std::string rest = ptrType.substr(3);
					if (rest.substr(0, 4) == "mut ") isMutable = true;
				}
			}
			
			if (isMutable)
			{
				return generateNode(ptrExpr) + ".set(" + generateNode(rhs) + ")";
			}
			// Immutable pointer - shouldn't happen, type checker should catch
		}
		return generateNode(lhs) + " = " + generateNode(rhs);
	}
	case ASTNodeType::IF_STMT:
	{
		// Check if this is used as an expression (has non-Void type)
		if (!node->inferredType.empty() && node->inferredType != "Void" && node->children.size() > 2)
		{
			// Generate as ternary expression
			std::stringstream ss;
			ss << "((" << generateNode(node->children[0]) << ") ? ";

			auto thenBranch = node->children[1];
			auto elseBranch = node->children[2];

			if (thenBranch->type == ASTNodeType::BLOCK)
				ss << "(() => " << generateFunctionBlock(thenBranch, node->inferredType) << ")()";
			else
				ss << generateNode(thenBranch);

			ss << " : ";

			if (elseBranch->type == ASTNodeType::BLOCK)
				ss << "(() => " << generateFunctionBlock(elseBranch, node->inferredType) << ")()";
			else
				ss << generateNode(elseBranch);

			ss << ")";
			return ss.str();
		}

		// Generate as statement
		std::stringstream ss;
		ss << "if (" << generateNode(node->children[0]) << ") ";
		ss << generateNode(node->children[1]);
		if (node->children.size() > 2)
		{
			ss << " else ";
			ss << generateNode(node->children[2]);
		}
		return ss.str();
	}
	case ASTNodeType::WHILE_STMT:
	{
		std::stringstream ss;
		ss << "while (" << generateNode(node->children[0]) << ") ";
		nextBlockIsLoop = true;
		ss << generateNode(node->children[1]);
		return ss.str();
	}
	case ASTNodeType::LOOP_STMT:
	{
		std::stringstream ss;
		ss << "while (true) ";
		nextBlockIsLoop = true;
		ss << generateNode(node->children[0]);
		return ss.str();
	}
	case ASTNodeType::BREAK_STMT:
	{
		// Inject destructor calls for all scopes up to nearest loop
		std::stringstream ss;
		for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
		{
			for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
			{
				ss << vit->destructor << "(" << vit->name << "); ";
			}
			if (it->isLoop)
				break;
		}
		ss << "break";
		return ss.str();
	}
	case ASTNodeType::CONTINUE_STMT:
	{
		// Inject destructor calls for current loop scope only
		std::stringstream ss;
		for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
		{
			for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
			{
				ss << vit->destructor << "(" << vit->name << "); ";
			}
			if (it->isLoop)
				break;
		}
		ss << "continue";
		return ss.str();
	}
	case ASTNodeType::BLOCK:
	{
		std::stringstream ss;
		ss << "{\n";

		// Push new scope
		Scope newScope;
		newScope.isLoop = nextBlockIsLoop;
		nextBlockIsLoop = false;
		scopes.push_back(newScope);

		for (auto child : node->children)
		{
			ss << "  " << generateNode(child) << ";\n";
		}

		// Pop scope and inject destructor calls (in reverse order)
		Scope &currentScope = scopes.back();
		for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
		{
			ss << "  " << it->destructor << "(" << it->name << ");\n";
		}
		scopes.pop_back();

		ss << "}";
		return ss.str();
	}
	case ASTNodeType::RETURN_STMT:
	{
		std::stringstream ss;
		// Inject destructor calls for all scopes before return
		for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
		{
			for (auto vit = it->vars.rbegin(); vit != it->vars.rend(); ++vit)
			{
				ss << vit->destructor << "(" << vit->name << "); ";
			}
		}
		if (node->children.empty())
			ss << "return";
		else
			ss << "return " << generateNode(node->children[0]);
		return ss.str();
	}
	case ASTNodeType::FUNCTION_DECL:
	{
		std::stringstream ss;
		ss << "function " << node->value << "(";

		// Generate parameters (all children except last are params)
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			ss << node->children[i]->value;
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
	case ASTNodeType::STRUCT_DECL:
		// Structs don't need runtime declaration in JS
		return "";
	case ASTNodeType::ENUM_DECL:
	{
		// Generate: const EnumName = { Variant1: 0, Variant2: 1, ... }
		std::stringstream ss;
		ss << "const " << node->value << " = { ";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << node->children[i]->value << ": " << i;
		}
		ss << " }";
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
