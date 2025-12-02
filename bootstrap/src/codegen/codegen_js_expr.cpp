#include "codegen_js.h"
#include <sstream>

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

std::string CodeGeneratorJS::generateExpr(std::shared_ptr<ASTNode> node)
{
	switch (node->type)
	{
	case ASTNodeType::IF_EXPR:
	{
		std::stringstream ss;
		ss << "(" << generateNode(node->children[0]) << " ? ";

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
	case ASTNodeType::MATCH_EXPR:
	{
		// Match expression compiles to nested ternary operators
		auto scrutinee = node->children[0];
		std::string scrutineeExpr = generateNode(scrutinee);
		std::string scrutineeType = scrutinee->inferredType;

		bool isUnion = isUnionType(scrutineeType);

		std::stringstream ss;
		ss << "(";

		std::string defaultBody;
		std::vector<std::pair<std::string, std::string>> patternBodies;

		for (size_t i = 1; i < node->children.size(); i++)
		{
			auto arm = node->children[i];
			std::string pattern = arm->value;

			std::string body;
			if (arm->children[0]->type == ASTNodeType::BLOCK)
			{
				body = "(() => " + generateFunctionBlock(arm->children[0], node->inferredType) + ")()";
			}
			else
			{
				body = generateNode(arm->children[0]);
			}

			if (pattern == "_")
			{
				defaultBody = body;
			}
			else
			{
				patternBodies.push_back({pattern, body});
			}
		}

		if (isUnion)
		{
			// Union type: compare __tag
			for (size_t i = 0; i < patternBodies.size(); i++)
			{
				if (i > 0)
					ss << " : ";
				ss << "(" << scrutineeExpr << ".__tag === \"" << patternBodies[i].first << "\") ? " << patternBodies[i].second;
			}
		}
		else
		{
			// Enum type: compare values
			for (size_t i = 0; i < patternBodies.size(); i++)
			{
				if (i > 0)
					ss << " : ";
				// Handle enum patterns: Color.Red -> Color.Red
				std::string enumPattern = patternBodies[i].first;
				size_t dotPos = enumPattern.find('.');
				if (dotPos == std::string::npos)
				{
					// Pattern is just variant name, prefix with scrutinee type
					enumPattern = scrutineeType + "." + enumPattern;
				}
				// Convert :: to . for JS
				size_t pos;
				while ((pos = enumPattern.find("::")) != std::string::npos)
				{
					enumPattern.replace(pos, 2, ".");
				}
				ss << "(" << scrutineeExpr << " === " << enumPattern << ") ? " << patternBodies[i].second;
			}
		}

		if (!defaultBody.empty())
		{
			ss << " : " << defaultBody;
		}
		else if (!patternBodies.empty())
		{
			ss << " : " << patternBodies.back().second;
		}

		ss << ")";
		return ss.str();
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

		if (node->isNarrowedUnion)
		{
			return name + ".__value";
		}

		return name;
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
		return object + "." + node->value;
	}
	default:
		return "";
	}
}
