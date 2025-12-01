#include "codegen_cpp.h"
#include <sstream>
#include <vector>

std::string CodeGeneratorCPP::generateNode(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::LET_STMT:
	{
		std::string cppType = mapType(node->inferredType);

		// Generate value with potential union wrapping
		std::string value = generateNode(node->children[0]);
		std::string wrappedValue = wrapInUnion(value, node->children[0]->inferredType, node->inferredType);

		// Track variable with destructor if applicable
		std::string dtor = getDestructor(node->inferredType);
		if (!dtor.empty() && !scopes.empty())
		{
			scopes.back().vars.push_back({node->value, dtor});
		}

		// Handle C++ array declaration: int32_t arr[3] instead of int32_t[3] arr
		size_t bracketPos = cppType.find('[');
		if (bracketPos != std::string::npos)
		{
			std::string baseType = cppType.substr(0, bracketPos);
			std::string arraySuffix = cppType.substr(bracketPos);
			std::string prefix = node->isMutable ? "" : "const ";
			return prefix + baseType + " " + node->value + arraySuffix + " = " + wrappedValue;
		}

		// For pointer types, const goes after * (e.g., int32_t* const p)
		if (!cppType.empty() && cppType.back() == '*')
		{
			if (node->isMutable)
			{
				return cppType + " " + node->value + " = " + wrappedValue;
			}
			else
			{
				return cppType + " const " + node->value + " = " + wrappedValue;
			}
		}

		std::string prefix = node->isMutable ? "" : "const ";
		return prefix + cppType + " " + node->value + " = " + wrappedValue;
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
		ScopeCPP newScope;
		newScope.isLoop = nextBlockIsLoop;
		nextBlockIsLoop = false;
		scopes.push_back(newScope);

		for (auto child : node->children)
		{
			ss << "  " << generateNode(child) << ";\n";
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
	{
		auto left = generateNode(node->children[0]);
		auto right = generateNode(node->children[1]);
		return left + " " + node->value + " " + right;
	}
	case ASTNodeType::IS_EXPR:
	{
		// is operator: expr is Type → expr.__is_Type()
		auto expr = generateNode(node->children[0]);
		std::string targetType = node->value;
		return "(" + expr + ".__is_" + targetType + "())";
	}
	case ASTNodeType::INTERSECTION_EXPR:
	{
		// Intersection operator: merge two struct values into one
		// Generate: merge_TYPE1_AND_TYPE2(left, right) which will be defined as a template
		auto left = node->children[0];
		auto right = node->children[1];
		std::string leftExpr = generateNode(left);
		std::string rightExpr = generateNode(right);

		// The result type name uses & replaced with _AND_
		std::string resultTypeName;
		for (char c : node->inferredType)
		{
			if (c == '&')
			{
				resultTypeName += "_AND_";
			}
			else
			{
				resultTypeName += c;
			}
		}

		// Use a lambda that creates the merged struct with designated initializers
		// We copy all fields from both operands
		std::stringstream ss;
		ss << resultTypeName << "::merge(" << leftExpr << ", " << rightExpr << ")";
		return ss.str();
	}
	case ASTNodeType::UNARY_OP:
	{
		auto operand = generateNode(node->children[0]);
		return "(" + node->value + operand + ")";
	}
	case ASTNodeType::ARRAY_LITERAL:
	{
		// Generate C++ initializer list
		std::stringstream ss;
		ss << "{";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << generateNode(node->children[i]);
		}
		ss << "}";
		return ss.str();
	}
	case ASTNodeType::INDEX_EXPR:
	{
		auto array = generateNode(node->children[0]);
		auto index = generateNode(node->children[1]);
		return array + "[" + index + "]";
	}
	case ASTNodeType::REFERENCE_EXPR:
	{
		// In C++, use the address-of operator
		return "&" + generateNode(node->children[0]);
	}
	case ASTNodeType::DEREF_EXPR:
	{
		// In C++, use the dereference operator
		return "*" + generateNode(node->children[0]);
	}
	case ASTNodeType::SIZEOF_EXPR:
	{
		// sizeOf(Type) maps to C++ sizeof operator
		std::string cppType = mapType(node->value);
		return "sizeof(" + cppType + ")";
	}
	case ASTNodeType::LITERAL:
	{
		// Strip type suffix from literals (e.g., "10I32" -> "10")
		std::string literal = node->value;
		std::string result;
		for (char c : literal)
		{
			if ((c >= '0' && c <= '9') || c == '.' || c == '-')
			{
				result += c;
			}
			else
			{
				break; // Stop at type suffix
			}
		}
		return result.empty() ? literal : result;
	}
	case ASTNodeType::IDENTIFIER:
		return node->value;
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
	{
		std::stringstream ss;
		// First child is callee (IDENTIFIER)
		ss << generateNode(node->children[0]);

		// Emit generic args <I32>
		if (!node->children[0]->genericArgs.empty())
		{
			ss << "<";
			for (size_t i = 0; i < node->children[0]->genericArgs.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << mapType(node->children[0]->genericArgs[i]);
			}
			ss << ">";
		}

		ss << "(";

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
	case ASTNodeType::ENUM_VALUE:
	{
		// Generate: EnumName::Variant
		auto enumName = node->children[0]; // The IDENTIFIER node for enum
		return enumName->value + "::" + node->value;
	}
	case ASTNodeType::STRUCT_LITERAL:
	{
		std::stringstream ss;
		ss << node->value;

		if (!node->genericArgs.empty())
		{
			ss << "<";
			for (size_t i = 0; i < node->genericArgs.size(); i++)
			{
				if (i > 0)
					ss << ", ";
				ss << mapType(node->genericArgs[i]);
			}
			ss << ">";
		}

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
		// If accessing field on a narrowed union, unwrap it using getter
		if (node->children[0]->isNarrowedUnion)
		{
			// Get the narrowed type (e.g., Some<I32>)
			std::string narrowedType = node->children[0]->inferredType;
			return object + ".__get_" + narrowedType + "()." + node->value;
		}
		return object + "." + node->value;
	}
	default:
		return "";
	}
}
