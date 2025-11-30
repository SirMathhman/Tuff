#include "codegen_js.h"
#include <sstream>

std::string CodeGeneratorJS::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	// For Node.js, we can just emit statements.
	// If the last node is an expression, we wrap it in process.exit()
	// Convert booleans to numbers (true=1, false=0) for exit code compatibility

	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL;
	};

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];

		// Skip expect and actual declarations
		if (child->type == ASTNodeType::EXPECT_DECL)
			continue;
		if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			ss << generateNode(child) << "\n";
			continue;
		}

		if (i == ast->children.size() - 1 && !isStatement(child->type))
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
			ss << generateNode(child) << ";\n";
		}
	}
	return ss.str();
}

std::string CodeGeneratorJS::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string keyword = node->isMutable ? "let" : "const";
		return keyword + " " + node->value + " = " + generateNode(node->children[0]);
	}
	case ASTNodeType::ASSIGNMENT_STMT:
	{
		auto lhs = node->children[0];
		auto rhs = node->children[1];
		return generateNode(lhs) + " = " + generateNode(rhs);
	}
	case ASTNodeType::IF_STMT:
	{
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
	case ASTNodeType::IF_EXPR:
	{
		std::stringstream ss;
		ss << "(" << generateNode(node->children[0]) << " ? ";
		ss << generateNode(node->children[1]) << " : ";
		ss << generateNode(node->children[2]) << ")";
		return ss.str();
	}
	case ASTNodeType::WHILE_STMT:
	{
		std::stringstream ss;
		ss << "while (" << generateNode(node->children[0]) << ") ";
		ss << generateNode(node->children[1]);
		return ss.str();
	}
	case ASTNodeType::LOOP_STMT:
	{
		std::stringstream ss;
		ss << "while (true) ";
		ss << generateNode(node->children[0]);
		return ss.str();
	}
	case ASTNodeType::BREAK_STMT:
		return "break";
	case ASTNodeType::CONTINUE_STMT:
		return "continue";
	case ASTNodeType::BLOCK:
	{
		std::stringstream ss;
		ss << "{\n";
		for (auto child : node->children)
		{
			ss << "  " << generateNode(child) << ";\n";
		}
		ss << "}";
		return ss.str();
	}
	case ASTNodeType::BINARY_OP:
	{
		auto left = generateNode(node->children[0]);
		auto right = generateNode(node->children[1]);
		return "(" + left + " " + node->value + " " + right + ")";
	}
	case ASTNodeType::UNARY_OP:
	{
		auto operand = generateNode(node->children[0]);
		return "(" + node->value + operand + ")";
	}
	case ASTNodeType::LITERAL:
	case ASTNodeType::IDENTIFIER:
		return node->value;
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
		ss << generateNode(node->children.back());
		return ss.str();
	}
	case ASTNodeType::CALL_EXPR:
	{
		std::stringstream ss;
		// First child is callee (IDENTIFIER)
		ss << generateNode(node->children[0]) << "(";

		// Remaining children are arguments
		for (size_t i = 1; i < node->children.size(); i++)
		{
			if (i > 1)
				ss << ", ";
			ss << generateNode(node->children[i]);
		}

		ss << ")";
		return ss.str();
	}
	case ASTNodeType::RETURN_STMT:
	{
		if (node->children.empty())
			return "return";
		else
			return "return " + generateNode(node->children[0]);
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
	case ASTNodeType::EXPECT_DECL:
	{
		// Skip expect declarations - they have no codegen
		return "";
	}
	case ASTNodeType::ACTUAL_DECL:
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
	case ASTNodeType::ENUM_VALUE:
	{
		// Generate: EnumName.Variant
		// The enum name is stored in inferredType, variant name in value
		auto enumName = node->children[0]; // The IDENTIFIER node for enum
		return enumName->value + "." + node->value;
	}
	case ASTNodeType::STRUCT_LITERAL:
	{
		// Generate: { field1, field2, field3 }
		std::stringstream ss;
		ss << "{ ";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << generateNode(node->children[i]);
		}
		ss << " }";
		return ss.str();
	}
	case ASTNodeType::FIELD_ACCESS:
	{
		auto object = generateNode(node->children[0]);
		return object + "." + node->value;
	}
	default:
		return "";
	}
}
