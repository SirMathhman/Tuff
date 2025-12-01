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

	auto isStatement = [](ASTNodeType type)
	{
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
			if (isMutablePtr(ptrType))
			{
				return generateNode(ptrExpr) + ".set(" + generateNode(rhs) + ")";
			}
			// Immutable pointer - shouldn't happen, type checker should catch
		}
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
	case ASTNodeType::BINARY_OP:
	{
		auto left = generateNode(node->children[0]);
		auto right = generateNode(node->children[1]);
		return "(" + left + " " + node->value + " " + right + ")";
	}
	case ASTNodeType::IS_EXPR:
	{
		// is operator: expr is Type → expr.__tag === "Type"
		auto expr = generateNode(node->children[0]);
		std::string targetType = node->value;
		return "(" + expr + ".__tag === \"" + targetType + "\")";
	}
	case ASTNodeType::INTERSECTION_EXPR:
	{
		// Intersection operator: merge two struct values into one
		// In JS, we use object spread: {...left, ...right}
		auto left = generateNode(node->children[0]);
		auto right = generateNode(node->children[1]);
		return "({..." + left + ", ..." + right + "})";
	}
	case ASTNodeType::UNARY_OP:
	{
		auto operand = generateNode(node->children[0]);
		return "(" + node->value + operand + ")";
	}
	case ASTNodeType::ARRAY_LITERAL:
	{
		std::stringstream ss;
		ss << "[";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			ss << generateNode(node->children[i]);
		}
		ss << "]";
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
		// In JS, we use an object wrapper to simulate references
		// For simplicity, just return the value (JS is pass-by-reference for objects)
		// For primitives, we'll need a wrapper: {value: x}
		auto operand = node->children[0];
		if (operand->type == ASTNodeType::IDENTIFIER)
		{
			// For mutable references, wrap in object
			if (node->isMutable)
			{
				return "{ptr: () => " + generateNode(operand) + ", set: (v) => " + generateNode(operand) + " = v}";
			}
			// For immutable, just return the value (we can't modify anyway)
			return generateNode(operand);
		}
		return generateNode(operand);
	}
	case ASTNodeType::DEREF_EXPR:
	{
		auto operand = node->children[0];
		// Check if this is a mutable pointer by looking at the operand's type
		std::string ptrType = operand->inferredType;
		if (isMutablePtr(ptrType))
		{
			// For mutable references, use .ptr() to read the value
			return generateNode(operand) + ".ptr()";
		}
		// For immutable references, just return the value
		return generateNode(operand);
	}
	case ASTNodeType::SIZEOF_EXPR:
	{
		// sizeOf is not supported in JS output; emit runtime error placeholder
		return "(() => { throw new Error(\"sizeOf operator is not supported in JavaScript target\"); })()";
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
	{
		// Convert FQN separator :: to . for JavaScript
		std::string name = node->value;
		size_t pos;
		while ((pos = name.find("::")) != std::string::npos)
		{
			name.replace(pos, 2, ".");
		}
		return name;
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
	case ASTNodeType::ENUM_VALUE:
	{
		// Generate: EnumName.Variant
		// The enum name is stored in inferredType, variant name in value
		auto enumName = node->children[0]; // The IDENTIFIER node for enum
		// Convert FQN :: to . for JavaScript
		std::string name = enumName->value;
		size_t pos;
		while ((pos = name.find("::")) != std::string::npos)
		{
			name.replace(pos, 2, ".");
		}
		return name + "." + node->value;
	}
	case ASTNodeType::STRUCT_LITERAL:
	{
		// Generate: { field1: val1, field2: val2 }
		std::stringstream ss;
		ss << "{ ";
		for (size_t i = 0; i < node->children.size(); i++)
		{
			if (i > 0)
				ss << ", ";
			if (i < node->fieldNames.size())
			{
				ss << node->fieldNames[i] << ": ";
			}
			ss << generateNode(node->children[i]);
		}
		ss << " }";
		return ss.str();
	}
	case ASTNodeType::FIELD_ACCESS:
	{
		auto object = generateNode(node->children[0]);
		// If accessing field on a narrowed union, unwrap it first
		if (node->children[0]->isNarrowedUnion)
		{
			return object + ".__value." + node->value;
		}
		return object + "." + node->value;
	}
	default:
		return "";
	}
}