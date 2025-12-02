#include "codegen_js.h"
#include <sstream>
#include <iostream>

// Helper to check if a pointer type is mutable (*mut T or *a mut T)
static bool isMutablePtr(const std::string &type)
{
	if (type.empty() || type[0] != '*')
		return false;
	// Check for *mut T
	if (type.substr(0, 5) == "*mut ")
		return true;
	// Check for *a mut T (lifetime followed by mut)
	if (type.length() > 2 && type[1] >= 'a' && type[1] <= 'z' && type[2] == ' ')
	{
		std::string rest = type.substr(3);
		return rest.substr(0, 4) == "mut ";
	}
	return false;
}

std::string CodeGeneratorJS::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	// For Node.js, we can just emit statements.
	// If the last node is an expression, we wrap it in process.exit()
	// Convert booleans to numbers (true=1, false=0) for exit code compatibility

	auto isStatement = [](std::shared_ptr<ASTNode> node)
	{
		ASTNodeType type = node->type;
		// IF_STMT with non-void type is an expression, not a statement
		if (type == ASTNodeType::IF_STMT && !node->inferredType.empty() && node->inferredType != "Void")
			return false;
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL || type == ASTNodeType::MODULE_DECL;
	};

	// Check if there's a main function
	bool hasUserMain = false;
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL && child->value == "main")
		{
			hasUserMain = true;
			break;
		}
	}

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];

		// Check extern function declarations for unsupported types
		if (child->type == ASTNodeType::EXTERN_FN_DECL)
		{
			for (const auto &param : child->children)
			{
				if (param->inferredType.find("SizeOf<") != std::string::npos)
				{
					std::cerr << "Error: Cannot compile function '" << child->value
										<< "' to JavaScript: parameter of type '" << param->inferredType
										<< "' is not supported." << std::endl;
					std::cerr << "SizeOf<T> is a compile-time concept for native code generation only." << std::endl;
					exit(1);
				}
			}
		}

		// Skip expect and actual declarations
		if (child->type == ASTNodeType::EXPECT_DECL)
			continue;
		if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			ss << generateNode(child) << "\n";
			continue;
		}

		if (i == ast->children.size() - 1 && !isStatement(child))
		{
			// Last node is an expression: return its value (converted to number if bool)
			std::string exitCode = generateNode(child);
			if (child->inferredType == "Bool")
			{
				exitCode = "(" + exitCode + " ? 1 : 0)";
			}
			ss << "process.exit(" << exitCode << ");\n";
		}
		else
		{
			std::string code = generateNode(child);
			// Only emit code if non-empty (skip extern declarations, use declarations, etc.)
			if (!code.empty())
			{
				ss << code << ";\n";
			}
		}
	}

	// If there's a user-defined main function, call it
	if (hasUserMain)
	{
		ss << "process.exit(main());\n";
	}

	return ss.str();
}

std::string CodeGeneratorJS::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	case ASTNodeType::ASSIGNMENT_STMT:
	case ASTNodeType::IF_STMT:
	case ASTNodeType::WHILE_STMT:
	case ASTNodeType::LOOP_STMT:
	case ASTNodeType::BREAK_STMT:
	case ASTNodeType::CONTINUE_STMT:
	case ASTNodeType::BLOCK:
	case ASTNodeType::RETURN_STMT:
	case ASTNodeType::FUNCTION_DECL:
	case ASTNodeType::STRUCT_DECL:
	case ASTNodeType::ENUM_DECL:
	case ASTNodeType::MODULE_DECL:
	case ASTNodeType::USE_DECL:
	case ASTNodeType::EXPECT_DECL:
	case ASTNodeType::ACTUAL_DECL:
		return generateStmt(node);
	default:
		return generateExpr(node);
	}
}
