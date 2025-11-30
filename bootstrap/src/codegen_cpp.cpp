#include "codegen_cpp.h"
#include <sstream>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n\n";

	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::FUNCTION_DECL;
	};

	// Generate struct declarations first
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::STRUCT_DECL)
		{
			ss << generateNode(child) << "\n";
		}
	}

	// Generate function forward declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			ss << mapType(child->inferredType) << " " << child->value << "(";
			for (size_t i = 0; i < child->children.size() - 1; i++)
			{
				if (i > 0)
					ss << ", ";
				ss << mapType(child->children[i]->inferredType) << " " << child->children[i]->value;
			}
			ss << ");\n";
		}
	}

	// Determine return type from last expression (if last node is an expression)
	std::string returnType = "int"; // default
	if (ast->children.size() > 0)
	{
		auto lastNode = ast->children.back();
		if (!isStatement(lastNode->type))
		{
			returnType = mapType(lastNode->inferredType);
		}
	}

	ss << returnType << " main() {\n";

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];

		// Skip struct and function declarations (already generated)
		if (child->type == ASTNodeType::STRUCT_DECL || child->type == ASTNodeType::FUNCTION_DECL)
			continue;

		if (i == ast->children.size() - 1 && !isStatement(child->type))
		{
			// Last node is an expression: return its value
			ss << "    return " << generateNode(child) << ";\n";
		}
		else
		{
			// Earlier nodes or statements: execute for side effects
			ss << "    " << generateNode(child) << ";\n";
		}
	}

	ss << "}\n";

	// Generate function definitions
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			ss << "\n"
				 << generateNode(child) << "\n";
		}
	}

	return ss.str();
}

std::string CodeGeneratorCPP::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string cppType = mapType(node->inferredType);
		std::string prefix = node->isMutable ? "" : "const ";
		return prefix + cppType + " " + node->value + " = " + generateNode(node->children[0]);
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
		ss << mapType(node->inferredType) << " " << node->value << "(";

		// Generate parameters (all children except last are params)
		for (size_t i = 0; i < node->children.size() - 1; i++)
		{
			if (i > 0)
				ss << ", ";
			ss << mapType(node->children[i]->inferredType) << " " << node->children[i]->value;
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
	{
		std::stringstream ss;
		ss << "struct " << node->value << " {\n";
		for (auto field : node->children)
		{
			ss << "    " << mapType(field->inferredType) << " " << field->value << ";\n";
		}
		ss << "};";
		return ss.str();
	}
	case ASTNodeType::STRUCT_LITERAL:
	{
		std::stringstream ss;
		ss << node->value << "{ ";
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

std::string CodeGeneratorCPP::mapType(std::string tuffType)
{
	if (tuffType == "I32")
		return "int32_t";
	if (tuffType == "Bool")
		return "bool";
	// Struct types pass through as-is
	return tuffType;
}
