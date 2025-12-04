#pragma once

#include "ast.h"
#include "ast_typed.h"

// ============================================================================
// AST TYPE CONVERTER - Converts type nodes to ast::TypePtr
// ============================================================================

class ASTTypeConverter
{
public:
	// Helper: Collect all union members from nested BINARY_OP nodes
	static void collectUnionMembers(std::shared_ptr<ASTNode> node, std::vector<ast::TypePtr> &members)
	{
		if (!node)
			return;

		if (node->type == ASTNodeType::BINARY_OP && node->value == "|")
		{
			// Recursively collect from left and right
			collectUnionMembers(node->children[0], members);
			collectUnionMembers(node->children[1], members);
		}
		else
		{
			// Base case: convert this node to a type
			members.push_back(toType(node));
		}
	}

	// Helper: Collect all intersection members from nested BINARY_OP nodes
	static void collectIntersectionMembers(std::shared_ptr<ASTNode> node, std::vector<ast::TypePtr> &members)
	{
		if (!node)
			return;

		if (node->type == ASTNodeType::BINARY_OP && node->value == "&")
		{
			// Recursively collect from left and right
			collectIntersectionMembers(node->children[0], members);
			collectIntersectionMembers(node->children[1], members);
		}
		else
		{
			// Base case: convert this node to a type
			members.push_back(toType(node));
		}
	}

	// Convert ASTNode type nodes to ast::TypePtr
	static ast::TypePtr toType(std::shared_ptr<ASTNode> node)
	{
		if (!node)
			return nullptr;

		switch (node->type)
		{
		case ASTNodeType::TYPE:
		case ASTNodeType::IDENTIFIER:
		{
			// Check for primitive types
			const std::string &name = node->value;
			if (name == "I8" || name == "I16" || name == "I32" || name == "I64" ||
					name == "U8" || name == "U16" || name == "U32" || name == "U64" ||
					name == "F32" || name == "F64" || name == "Bool" || name == "Void" ||
					name == "USize" || name == "Char")
			{
				ast::PrimitiveType t;
				t.name = name;
				return std::make_shared<ast::Type>(t);
			}

			// Named type (struct, enum, type alias, or generic)
			ast::NamedType t;
			t.name = name;
			for (auto &arg : node->genericArgsNodes)
				t.genericArgs.push_back(toType(arg));
			return std::make_shared<ast::Type>(t);
		}

		case ASTNodeType::POINTER_TYPE:
		{
			ast::PointerType t;
			t.isMutable = node->isMutable;
			t.lifetime = node->lifetime;
			if (!node->children.empty())
				t.pointee = toType(node->children[0]);
			return std::make_shared<ast::Type>(t);
		}

		case ASTNodeType::ARRAY_TYPE:
		{
			ast::ArrayType t;
			if (node->children.size() > 0)
				t.elementType = toType(node->children[0]);
			// initCount and capacity would need toExpr - skip for now
			return std::make_shared<ast::Type>(t);
		}

		case ASTNodeType::FUNCTION_PTR_TYPE:
		{
			// node->value is param count, children[0..n-1] are params, children[n] is return type
			ast::FunctionType t;
			size_t paramCount = std::stoul(node->value);
			for (size_t i = 0; i < paramCount; i++)
			{
				t.paramTypes.push_back(toType(node->children[i]));
			}
			t.returnType = toType(node->children[paramCount]);
			return std::make_shared<ast::Type>(t);
		}

		case ASTNodeType::BINARY_OP:
		{
			// Handle union (|) and intersection (&) types
			if (node->value == "|")
			{
				ast::UnionType t;
				// Flatten nested union types
				collectUnionMembers(node, t.members);
				return std::make_shared<ast::Type>(t);
			}
			else if (node->value == "&")
			{
				ast::IntersectionType t;
				// Flatten nested intersection types
				collectIntersectionMembers(node, t.members);
				return std::make_shared<ast::Type>(t);
			}
			return nullptr;
		}

		default:
			// Fallback: try to use inferredType string as primitive
			if (!node->inferredType.empty())
			{
				return typeFromString(node->inferredType);
			}
			return nullptr;
		}
	}

	// Create TypePtr from inferredType string (fallback)
	static ast::TypePtr typeFromString(const std::string &typeStr)
	{
		if (typeStr.empty())
			return nullptr;

		// Check for function pointer type: |T1, T2| => Ret
		if (!typeStr.empty() && typeStr[0] == '|')
		{
			// Find closing |
			size_t closePos = 1;
			int depth = 0;
			while (closePos < typeStr.length())
			{
				if (typeStr[closePos] == '<')
					depth++;
				else if (typeStr[closePos] == '>')
					depth--;
				else if (typeStr[closePos] == '|' && depth == 0)
					break;
				closePos++;
			}

			std::string paramsStr = typeStr.substr(1, closePos - 1);
			size_t arrowPos = typeStr.find("=>", closePos);
			if (arrowPos != std::string::npos)
			{
				std::string retStr = typeStr.substr(arrowPos + 2);
				while (!retStr.empty() && retStr[0] == ' ')
					retStr = retStr.substr(1);

				ast::FunctionType t;
				t.returnType = typeFromString(retStr);

				// Parse param types
				if (!paramsStr.empty())
				{
					depth = 0;
					std::string current;
					for (char c : paramsStr)
					{
						if (c == '<')
							depth++;
						else if (c == '>')
							depth--;
						else if (c == ',' && depth == 0)
						{
							while (!current.empty() && current[0] == ' ')
								current = current.substr(1);
							while (!current.empty() && current.back() == ' ')
								current.pop_back();
							if (!current.empty())
								t.paramTypes.push_back(typeFromString(current));
							current.clear();
							continue;
						}
						current += c;
					}
					while (!current.empty() && current[0] == ' ')
						current = current.substr(1);
					while (!current.empty() && current.back() == ' ')
						current.pop_back();
					if (!current.empty())
						t.paramTypes.push_back(typeFromString(current));
				}

				return std::make_shared<ast::Type>(t);
			}
		}

		// Check for SizeOf<T> type - maps to USize
		if (typeStr.rfind("SizeOf<", 0) == 0)
		{
			ast::PrimitiveType t;
			t.name = "USize";
			return std::make_shared<ast::Type>(t);
		}

		// Check for union type (contains | but not at start - function pointers start with |)
		// Must also check that | is not inside angle brackets (e.g., SizeOf<A|B> is not a union)
		size_t pipePos = typeStr.find('|');
		if (pipePos != std::string::npos && pipePos > 0)
		{
			// Check if | is inside angle brackets
			int depth = 0;
			bool pipeInsideBrackets = false;
			for (size_t i = 0; i < pipePos; i++)
			{
				if (typeStr[i] == '<')
					depth++;
				else if (typeStr[i] == '>')
					depth--;
			}
			pipeInsideBrackets = (depth > 0);

			if (!pipeInsideBrackets)
			{
				ast::UnionType t;
				size_t pos = 0;
				while (pos < typeStr.length())
				{
					size_t nextPipe = typeStr.find('|', pos);
					if (nextPipe == std::string::npos)
						nextPipe = typeStr.length();

					std::string memberStr = typeStr.substr(pos, nextPipe - pos);
					// Trim whitespace
					while (!memberStr.empty() && memberStr[0] == ' ')
						memberStr = memberStr.substr(1);
					while (!memberStr.empty() && memberStr.back() == ' ')
						memberStr.pop_back();

					if (!memberStr.empty())
						t.members.push_back(typeFromString(memberStr));

					pos = nextPipe + 1;
				}
				return std::make_shared<ast::Type>(t);
			}
		}

		// Check for primitive
		if (typeStr == "I8" || typeStr == "I16" || typeStr == "I32" || typeStr == "I64" ||
				typeStr == "U8" || typeStr == "U16" || typeStr == "U32" || typeStr == "U64" ||
				typeStr == "F32" || typeStr == "F64" || typeStr == "Bool" || typeStr == "Void" ||
				typeStr == "USize" || typeStr == "Char")
		{
			ast::PrimitiveType t;
			t.name = typeStr;
			return std::make_shared<ast::Type>(t);
		}

		// Check for pointer type
		if (typeStr.length() > 0 && typeStr[0] == '*')
		{
			ast::PointerType t;
			size_t start = 1;
			if (typeStr.substr(1, 4) == "mut ")
			{
				t.isMutable = true;
				start = 5;
			}
			t.pointee = typeFromString(typeStr.substr(start));
			return std::make_shared<ast::Type>(t);
		}

		// Check for array type [T; init; cap]
		if (typeStr.length() > 0 && typeStr[0] == '[')
		{
			ast::ArrayType t;
			size_t semi = typeStr.find(';');
			if (semi != std::string::npos)
			{
				std::string elemType = typeStr.substr(1, semi - 1);
				t.elementType = typeFromString(elemType);
			}
			return std::make_shared<ast::Type>(t);
		}

		// Otherwise treat as named type
		ast::NamedType t;
		// Handle generic args like "Vec<I32>"
		size_t lt = typeStr.find('<');
		if (lt != std::string::npos)
		{
			t.name = typeStr.substr(0, lt);
			size_t gt = typeStr.rfind('>');
			if (gt != std::string::npos && gt > lt)
			{
				std::string args = typeStr.substr(lt + 1, gt - lt - 1);
				size_t pos = 0;
				while (pos < args.length())
				{
					size_t comma = args.find(',', pos);
					if (comma == std::string::npos)
						comma = args.length();
					std::string arg = args.substr(pos, comma - pos);
					// Trim whitespace
					while (!arg.empty() && arg[0] == ' ')
						arg = arg.substr(1);
					while (!arg.empty() && arg.back() == ' ')
						arg.pop_back();
					if (!arg.empty())
						t.genericArgs.push_back(typeFromString(arg));
					pos = comma + 1;
				}
			}
		}
		else
		{
			t.name = typeStr;
		}
		return std::make_shared<ast::Type>(t);
	}
};
