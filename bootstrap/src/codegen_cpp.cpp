#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generate(std::shared_ptr<ASTNode> ast)
{
	std::stringstream ss;
	ss << "#include <iostream>\n";
	ss << "#include <cstdint>\n";
	ss << "#include \"string_builtins.h\"\n";

	// Generate external includes from "use extern" declarations
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::EXTERN_USE_DECL)
		{
			ss << "#include <" << child->value << ".h>\n";
		}
	}
	ss << "\n";

	auto isStatement = [](ASTNodeType type)
	{
		return type == ASTNodeType::LET_STMT || type == ASTNodeType::ASSIGNMENT_STMT || type == ASTNodeType::IF_STMT || type == ASTNodeType::WHILE_STMT || type == ASTNodeType::LOOP_STMT || type == ASTNodeType::BREAK_STMT || type == ASTNodeType::CONTINUE_STMT || type == ASTNodeType::BLOCK || type == ASTNodeType::RETURN_STMT || type == ASTNodeType::STRUCT_DECL || type == ASTNodeType::ENUM_DECL || type == ASTNodeType::FUNCTION_DECL || type == ASTNodeType::EXPECT_DECL || type == ASTNodeType::ACTUAL_DECL || type == ASTNodeType::EXTERN_FN_DECL || type == ASTNodeType::EXTERN_USE_DECL || type == ASTNodeType::MODULE_DECL;
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
			// Skip main - it's generated as the entry point wrapper
			if (child->value == "main")
				continue;
			if (!child->genericParams.empty())
			{
				ss << "template<";
				for (size_t i = 0; i < child->genericParams.size(); i++)
				{
					if (i > 0)
						ss << ", ";
					ss << "typename " << child->genericParams[i]->value;
				}
				ss << ">\n";
			}
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
	bool hasReturnValue = false;

	if (ast->children.size() > 0)
	{
		auto lastNode = ast->children.back();
		if (!isStatement(lastNode->type))
		{
			hasReturnValue = true;
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
			else if (inferredType == "Void")
			{
				returnType = "int"; // main must return int
				hasReturnValue = false;
			}
			else
			{
				returnType = mapType(inferredType);
				if (returnType == "bool")
					returnType = "int"; // main must return int
			}
		}
	}

	ss << "int main() {\n";

	for (size_t i = 0; i < ast->children.size(); ++i)
	{
		auto child = ast->children[i];

		// Skip struct, enum, function, expect, actual, extern, use extern, and module declarations (already generated or no codegen needed)
		if (child->type == ASTNodeType::STRUCT_DECL || child->type == ASTNodeType::ENUM_DECL || child->type == ASTNodeType::FUNCTION_DECL || child->type == ASTNodeType::EXPECT_DECL || child->type == ASTNodeType::ACTUAL_DECL || child->type == ASTNodeType::EXTERN_FN_DECL || child->type == ASTNodeType::EXTERN_USE_DECL || child->type == ASTNodeType::MODULE_DECL)
			continue;

		if (i == ast->children.size() - 1 && !isStatement(child->type))
		{
			// Last node is an expression: return its value
			if (needsEnumCast)
			{
				ss << "    return static_cast<int>(" << generateNode(child) << ");\n";
			}
			else if (hasReturnValue)
			{
				ss << "    return " << generateNode(child) << ";\n";
			}
			else
			{
				ss << "    " << generateNode(child) << ";\n";
				ss << "    return 0;\n";
			}
		}
		else
		{
			// Earlier nodes or statements: execute for side effects
			ss << "    " << generateNode(child) << ";\n";
		}
	}

	if (ast->children.empty() || isStatement(ast->children.back()->type))
	{
		ss << "    return 0;\n";
	}

	ss << "}\n";

	// Generate function definitions
	for (auto child : ast->children)
	{
		if (child->type == ASTNodeType::FUNCTION_DECL)
		{
			// Skip main - it's already generated as the entry point wrapper
			if (child->value == "main")
				continue;
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
