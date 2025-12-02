#include "parser.h"
#include <iostream>

// Member function to check if identifier is a lifetime (lowercase first char)
bool Parser::isLifetimeParam(const std::string &name) const
{
	return !name.empty() && name[0] >= 'a' && name[0] <= 'z';
}

std::vector<std::shared_ptr<ASTNode>> Parser::parseGenericParams()
{
	std::vector<std::shared_ptr<ASTNode>> params;
	if (match(TokenType::LESS))
	{
		while (peek().type != TokenType::GREATER && peek().type != TokenType::END_OF_FILE)
		{
			auto paramName = consume(TokenType::IDENTIFIER, "Expected type parameter name");
			auto paramNode = std::make_shared<ASTNode>();
			// Lowercase = lifetime param, Uppercase = type param
			if (isLifetimeParam(paramName.value))
			{
				paramNode->type = ASTNodeType::LIFETIME_PARAM;
			}
			else
			{
				paramNode->type = ASTNodeType::TYPE_PARAM_DECL;
			}
			paramNode->value = paramName.value;

			// Check for type bound: T : SomeType
			if (match(TokenType::COLON))
			{
				paramNode->typeBoundNode = parseType();
				// Keep string version for compatibility if needed, or remove
				// paramNode->typeBound = ...; // We don't have a string converter yet
			}

			params.push_back(paramNode);

			if (!match(TokenType::COMMA))
			{
				break;
			}
		}
		consume(TokenType::GREATER, "Expected '>' after type parameters");
	}
	return params;
}

std::shared_ptr<ASTNode> Parser::parseType()
{
	auto leftType = parseIntersectionType();

	// Handle union types: Type0 | Type1 | Type2 (lowest precedence)
	if (match(TokenType::PIPE))
	{
		auto unionNode = std::make_shared<ASTNode>();
		unionNode->type = ASTNodeType::BINARY_OP;
		unionNode->value = "|";
		unionNode->addChild(leftType);

		// First iteration
		auto rightType = parseIntersectionType();
		unionNode->addChild(rightType);

		// Subsequent iterations
		while (match(TokenType::PIPE))
		{
			auto nextType = parseIntersectionType();
			auto newUnion = std::make_shared<ASTNode>();
			newUnion->type = ASTNodeType::BINARY_OP;
			newUnion->value = "|";
			newUnion->addChild(unionNode);
			newUnion->addChild(nextType);
			unionNode = newUnion;
		}
		return unionNode;
	}

	return leftType;
}

std::shared_ptr<ASTNode> Parser::parseIntersectionType()
{
	auto leftType = parseSingleType();

	// Handle intersection types: Type0 & Type1
	if (match(TokenType::AMPERSAND))
	{
		auto intersectionNode = std::make_shared<ASTNode>();
		intersectionNode->type = ASTNodeType::BINARY_OP;
		intersectionNode->value = "&";
		intersectionNode->addChild(leftType);

		auto rightType = parseSingleType();
		intersectionNode->addChild(rightType);

		while (match(TokenType::AMPERSAND))
		{
			auto nextType = parseSingleType();
			auto newIntersection = std::make_shared<ASTNode>();
			newIntersection->type = ASTNodeType::BINARY_OP;
			newIntersection->value = "&";
			newIntersection->addChild(intersectionNode);
			newIntersection->addChild(nextType);
			intersectionNode = newIntersection;
		}
		return intersectionNode;
	}
	return leftType;
}

std::shared_ptr<ASTNode> Parser::parseSingleType()
{
	// Handle destructor type: #name
	if (match(TokenType::HASH))
	{
		auto name = consume(TokenType::IDENTIFIER, "Expected identifier after '#'");
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::TYPE;
		node->value = "#" + name.value;
		return node;
	}

	// Handle SizeOf<Type> type expressions
	if (match(TokenType::SIZEOF))
	{
		consume(TokenType::LESS, "Expected '<' after 'SizeOf'");
		auto innerType = parseType();
		consume(TokenType::GREATER, "Expected '>' after SizeOf type parameter");

		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::SIZEOF_EXPR;
		node->addChild(innerType);
		return node;
	}

	// Handle pointer types: *T, *mut T, *a T (with lifetime), *a mut T
	if (match(TokenType::STAR))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::POINTER_TYPE;
		node->value = "*";

		// Check for lifetime annotation (lowercase identifier followed by space)
		if (peek().type == TokenType::IDENTIFIER && isLifetimeParam(peek().value))
		{
			Token lifetimeToken = advance();
			node->lifetime = lifetimeToken.value;
		}

		bool isMutable = match(TokenType::MUT);
		node->isMutable = isMutable;

		auto innerType = parseSingleType();
		node->addChild(innerType);
		return node;
	}

	// Handle array types: [T; init; capacity] or [T] (slice)
	if (match(TokenType::LBRACKET))
	{
		auto elementType = parseSingleType();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::ARRAY_TYPE;
		node->addChild(elementType);

		// Check if this is a slice [T] or sized array [T; init; capacity]
		if (match(TokenType::RBRACKET))
		{
			// Slice type: [T]
			return node;
		}

		// Sized array: [T; init; capacity]
		consume(TokenType::SEMICOLON, "Expected ';' after array element type");

		// Parse init: can be literal, identifier, or this.field
		// We need to parse these as expressions
		// But parseExpression returns ASTNode, which is what we want!
		// However, the original code parsed them as strings.
		// We should use parseExpression() here if possible, but we need to be careful about precedence/terminators.
		// Since it's delimited by semicolon, parseExpression should work.

		auto initExpr = parseExpression();
		node->addChild(initExpr);

		consume(TokenType::SEMICOLON, "Expected ';' after init count");

		auto capExpr = parseExpression();
		node->addChild(capExpr);

		consume(TokenType::RBRACKET, "Expected ']' after array capacity");
		return node;
	}

	Token typeToken = advance();
	if (typeToken.type != TokenType::IDENTIFIER &&
			typeToken.type != TokenType::I32 && typeToken.type != TokenType::BOOL &&
			typeToken.type != TokenType::I8 && typeToken.type != TokenType::I16 &&
			typeToken.type != TokenType::I64 && typeToken.type != TokenType::U8 &&
			typeToken.type != TokenType::U16 && typeToken.type != TokenType::U32 &&
			typeToken.type != TokenType::U64 && typeToken.type != TokenType::F32 &&
			typeToken.type != TokenType::F64 && typeToken.type != TokenType::VOID &&
			typeToken.type != TokenType::USIZE)
	{
		std::cerr << "Error: Expected type at line " << typeToken.line << std::endl;
		exit(1);
	}

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::TYPE;
	node->value = typeToken.value;

	// Handle FQN: name::name
	if (typeToken.type == TokenType::IDENTIFIER)
	{
		while (match(TokenType::DOUBLE_COLON))
		{
			node->value += "::";
			node->value += consume(TokenType::IDENTIFIER, "Expected identifier after '::'").value;
		}
	}

	// Handle generics: Type<T, U>
	if (typeToken.type == TokenType::IDENTIFIER && match(TokenType::LESS))
	{
		// We need to parse generic args as AST nodes
		while (peek().type != TokenType::GREATER && peek().type != TokenType::END_OF_FILE)
		{
			node->genericArgsNodes.push_back(parseType());
			if (match(TokenType::COMMA))
			{
				continue;
			}
		}
		consume(TokenType::GREATER, "Expected '>' after generic type arguments");
	}

	return node;
}

bool Parser::isGenericInstantiation()
{
	if (peek().type != TokenType::LESS)
		return false;

	int offset = 1;
	int depth = 1;
	while (peek(offset).type != TokenType::END_OF_FILE)
	{
		TokenType t = peek(offset).type;
		if (t == TokenType::LESS)
		{
			depth++;
		}
		else if (t == TokenType::GREATER)
		{
			depth--;
			if (depth == 0)
			{
				// Found matching >
				TokenType next = peek(offset + 1).type;
				return next == TokenType::LPAREN || next == TokenType::LBRACE || next == TokenType::COLON;
			}
		}
		else if (t == TokenType::RIGHT_SHIFT)
		{
			depth -= 2;
			if (depth <= 0)
			{
				TokenType next = peek(offset + 1).type;
				return next == TokenType::LPAREN || next == TokenType::LBRACE || next == TokenType::COLON;
			}
		}
		else if (t == TokenType::SEMICOLON)
		{
			return false;
		}
		offset++;
	}
	return false;
}

std::vector<std::shared_ptr<ASTNode>> Parser::parseGenericArgs()
{
	std::vector<std::shared_ptr<ASTNode>> args;
	if (match(TokenType::LESS))
	{
		while (peek().type != TokenType::GREATER && peek().type != TokenType::END_OF_FILE)
		{
			args.push_back(parseType());
			if (!match(TokenType::COMMA))
			{
				break;
			}
		}
		consume(TokenType::GREATER, "Expected '>' after generic arguments");
	}
	return args;
}

static std::string expressionToString(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return "";
	switch (node->type)
	{
	case ASTNodeType::LITERAL:
		return node->value;
	case ASTNodeType::IDENTIFIER:
		return node->value;
	case ASTNodeType::FIELD_ACCESS:
		return expressionToString(node->children[0]) + "." + node->value;
	case ASTNodeType::BINARY_OP:
		return expressionToString(node->children[0]) + " " + node->value + " " + expressionToString(node->children[1]);
	case ASTNodeType::UNARY_OP:
		return node->value + expressionToString(node->children[0]);
	case ASTNodeType::SIZEOF_EXPR:
		return "sizeOf(" + node->value + ")";
	default:
		return "...";
	}
}

std::string Parser::typeToString(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return "Void";

	switch (node->type)
	{
	case ASTNodeType::TYPE:
	{
		std::string res = node->value;
		if (!node->genericArgsNodes.empty())
		{
			res += "<";
			for (size_t i = 0; i < node->genericArgsNodes.size(); i++)
			{
				if (i > 0)
					res += ", ";
				res += typeToString(node->genericArgsNodes[i]);
			}
			res += ">";
		}
		return res;
	}
	case ASTNodeType::POINTER_TYPE:
	{
		std::string res = "*";
		if (!node->lifetime.empty())
			res += node->lifetime + " ";
		if (node->isMutable)
			res += "mut ";
		if (!node->children.empty())
			res += typeToString(node->children[0]);
		return res;
	}
	case ASTNodeType::ARRAY_TYPE:
	{
		if (node->children.empty())
			return "[Unknown]";
		std::string res = "[" + typeToString(node->children[0]);
		if (node->children.size() > 1)
		{
			// Init and capacity are expressions
			res += "; " + expressionToString(node->children[1]);
			if (node->children.size() > 2)
			{
				res += "; " + expressionToString(node->children[2]);
			}
		}
		res += "]";
		return res;
	}
	case ASTNodeType::BINARY_OP:
	{
		if (node->value == "|")
		{
			return typeToString(node->children[0]) + "|" + typeToString(node->children[1]);
		}
		if (node->value == "&")
		{
			return typeToString(node->children[0]) + "&" + typeToString(node->children[1]);
		}
		return "UnknownBinaryOp";
	}
	case ASTNodeType::SIZEOF_EXPR:
	{
		return "SizeOf<" + typeToString(node->children[0]) + ">";
	}
	default:
		return "UnknownType";
	}
}
