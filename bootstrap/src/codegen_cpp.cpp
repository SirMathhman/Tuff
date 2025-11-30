#include "codegen_cpp.h"
#include <sstream>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n\n";

	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL || type == ASTNodeType::MODULE_DECL;
	};

	// Generate module declarations first (at top level, not inside main)
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::MODULE_DECL)
		{
			ss << generateNode(child) << "\n";
		}
	}

	// Generate enum declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::ENUM_DECL)
		{
			ss << generateNode(child) << "\n";
		}
	}

	// Generate struct declarations
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
		else if (child->type == ASTNodeType::ACTUAL_DECL)
		{
			ss << mapType(child->inferredType) << " " << child->value << "(";
			size_t paramCount = 0;
			for (auto param : child->children)
			{
				if (param->type == ASTNodeType::IDENTIFIER)
				{
					if (paramCount > 0)
						ss << ", ";
					ss << mapType(param->inferredType) << " " << param->value;
					paramCount++;
				}
			}
			ss << ");\n";
		}
	}

	// Determine return type from last expression (if last node is an expression)
	std::string returnType = "int"; // default
	bool needsEnumCast = false;
	if (ast->children.size() > 0)
	{
		auto lastNode = ast->children.back();
		if (!isStatement(lastNode->type))
		{
			std::string inferredType = lastNode->inferredType;
			// Check if it's an enum type (not a primitive type)
			if (inferredType != "I32" && inferredType != "Bool" && inferredType != "I8" &&
					inferredType != "I16" && inferredType != "I64" && inferredType != "U8" &&
					inferredType != "U16" && inferredType != "U32" && inferredType != "U64" &&
					inferredType != "F32" && inferredType != "F64" && inferredType != "Void")
			{
				// Assume it's an enum, keep return type as int and cast
				needsEnumCast = true;
			}
			else
			{
				returnType = mapType(inferredType);
			}
		}
	}

	ss << returnType << " main() {\n";

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];

		// Skip struct, enum, function, expect, actual, and module declarations (already generated)
		if (child->type == ASTNodeType::STRUCT_DECL || child->type == ASTNodeType::ENUM_DECL || child->type == ASTNodeType::FUNCTION_DECL || child->type == ASTNodeType::EXPECT_DECL || child->type == ASTNodeType::ACTUAL_DECL || child->type == ASTNodeType::MODULE_DECL)
			continue;

		if (i == ast->children.size() - 1 && !isStatement(child->type))
		{
			// Last node is an expression: return its value
			if (needsEnumCast)
			{
				ss << "    return static_cast<int>(" << generateNode(child) << ");\n";
			}
			else
			{
				ss << "    return " << generateNode(child) << ";\n";
			}
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
		else if (child->type == ASTNodeType::ACTUAL_DECL)
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
	{
		// Generate module as C++ namespace
		// e.g., module math { fn add(...) } becomes:
		// namespace math { type add(...) { ... } }
		std::stringstream ss;
		std::string moduleName = node->value;

		// Split by :: for nested namespaces
		size_t pos = 0;
		std::vector<std::string> parts;
		while ((pos = moduleName.find("::")) != std::string::npos)
		{
			parts.push_back(moduleName.substr(0, pos));
			moduleName = moduleName.substr(pos + 2);
		}
		parts.push_back(moduleName);

		// Generate opening namespaces
		for (const auto &part : parts)
		{
			ss << "namespace " << part << " {\n";
		}

		// Generate module body
		for (auto child : node->children)
		{
			ss << generateNode(child) << "\n";
		}

		// Generate closing braces for namespaces
		for (size_t i = 0; i < parts.size(); i++)
		{
			ss << "}";
			if (i < parts.size() - 1)
				ss << " ";
		}

		return ss.str();
	}
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
	{
		// Generate actual as a normal function
		std::stringstream ss;
		ss << mapType(node->inferredType) << " " << node->value << "(";

		// Parameters
		size_t paramIdx = 0;
		for (auto param : node->children)
		{
			if (param->type == ASTNodeType::IDENTIFIER)
			{
				if (paramIdx > 0)
					ss << ", ";
				ss << mapType(param->inferredType) << " " << param->value;
				paramIdx++;
			}
		}
		ss << ") ";

		// Find body
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
		// Generate: EnumName::Variant
		auto enumName = node->children[0]; // The IDENTIFIER node for enum
		return enumName->value + "::" + node->value;
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
