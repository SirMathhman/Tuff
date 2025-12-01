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
				paramNode->typeBound = parseType();
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

std::string Parser::parseType()
{
	std::string leftType = parseIntersectionType();

	// Handle union types: Type0 | Type1 | Type2 (lowest precedence)
	if (match(TokenType::PIPE))
	{
		std::string unionType = leftType;
		while (true)
		{
			unionType += "|";
			unionType += parseIntersectionType();
			if (!match(TokenType::PIPE))
			{
				break;
			}
		}
		return unionType;
	}

	return leftType;
}

std::string Parser::parseIntersectionType()
{
	std::string leftType = parseSingleType();

	// Handle intersection types: Type0 & Type1 & Type2
	if (match(TokenType::AMPERSAND))
	{
		std::string intersectionType = leftType;
		while (true)
		{
			intersectionType += "&";
			intersectionType += parseSingleType();
			if (!match(TokenType::AMPERSAND))
			{
				break;
			}
		}
		return intersectionType;
	}

	return leftType;
}

std::string Parser::parseSingleType()
{
	// Handle SizeOf<Type> type expressions
	if (match(TokenType::SIZEOF))
	{
		consume(TokenType::LESS, "Expected '<' after 'SizeOf'");
		std::string innerType = parseType();
		consume(TokenType::GREATER, "Expected '>' after SizeOf type parameter");
		return "SizeOf<" + innerType + ">";
	}

	// Handle destructor types: #DestructorName
	if (match(TokenType::HASH))
	{
		Token destructorName = consume(TokenType::IDENTIFIER, "Expected destructor name after '#'");
		return "#" + destructorName.value;
	}

	// Handle pointer types: *T, *mut T, *a T, *a mut T
	if (match(TokenType::STAR))
	{
		std::string lifetime = "";
		// Check for lifetime: *a (where 'a' is lowercase identifier)
		if (peek().type == TokenType::IDENTIFIER && isLifetimeParam(peek().value))
		{
			lifetime = advance().value;
		}
		bool isMutable = match(TokenType::MUT);
		std::string innerType = parseSingleType();
		std::string result = "*";
		if (!lifetime.empty())
		{
			result += lifetime + " ";
		}
		if (isMutable)
		{
			result += "mut ";
		}
		return result + innerType;
	}

	// Handle array types: [T; init; capacity] or [T] (slice)
	if (match(TokenType::LBRACKET))
	{
		std::string elementType = parseSingleType();

		// Check if this is a slice [T] or sized array [T; init; capacity]
		if (match(TokenType::RBRACKET))
		{
			// Slice type: [T]
			return "[" + elementType + "]";
		}

		// Sized array: [T; init; capacity]
		consume(TokenType::SEMICOLON, "Expected ';' after array element type");

		// Parse init: can be literal, identifier, or this.field
		std::string init;
		if (peek().type == TokenType::THIS)
		{
			advance(); // consume 'this'
			consume(TokenType::DOT, "Expected '.' after 'this'");
			Token fieldToken = consume(TokenType::IDENTIFIER, "Expected field name after 'this.'");
			init = "this." + fieldToken.value;
		}
		else
		{
			Token initToken = advance();
			if (initToken.type != TokenType::INT_LITERAL && initToken.type != TokenType::IDENTIFIER)
			{
				std::cerr << "Error: Expected init count (literal, type parameter, or this.field) in array type at line " << initToken.line << std::endl;
				exit(1);
			}
			init = initToken.value;
		}

		consume(TokenType::SEMICOLON, "Expected ';' after init count");

		// Parse capacity: can be literal, identifier, or this.field
		std::string capacity;
		if (peek().type == TokenType::THIS)
		{
			advance(); // consume 'this'
			consume(TokenType::DOT, "Expected '.' after 'this'");
			Token fieldToken = consume(TokenType::IDENTIFIER, "Expected field name after 'this.'");
			capacity = "this." + fieldToken.value;
		}
		else
		{
			Token capacityToken = advance();
			if (capacityToken.type != TokenType::INT_LITERAL && capacityToken.type != TokenType::IDENTIFIER)
			{
				std::cerr << "Error: Expected capacity (literal, type parameter, or this.field) in array type at line " << capacityToken.line << std::endl;
				exit(1);
			}
			capacity = capacityToken.value;
		}
		return "[" + elementType + "; " + init + "; " + capacity + "]";
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

	std::string typeName = typeToken.value;

	// Handle FQN: name::name
	if (typeToken.type == TokenType::IDENTIFIER)
	{
		while (match(TokenType::DOUBLE_COLON))
		{
			typeName += "::";
			typeName += consume(TokenType::IDENTIFIER, "Expected identifier after '::'").value;
		}
	}

	// Handle generics: Type<T, U>
	if (typeToken.type == TokenType::IDENTIFIER && match(TokenType::LESS))
	{
		typeName += "<";
		while (peek().type != TokenType::GREATER && peek().type != TokenType::END_OF_FILE)
		{
			typeName += parseType();
			if (match(TokenType::COMMA))
			{
				typeName += ",";
			}
		}
		consume(TokenType::GREATER, "Expected '>' after generic type arguments");
		typeName += ">";
	}

	// Handle multiple-of types: Type * Literal or Type * TypeParam
	if (match(TokenType::STAR))
	{
		Token multipleLiteral = advance();
		if (multipleLiteral.type != TokenType::INT_LITERAL && multipleLiteral.type != TokenType::IDENTIFIER)
		{
			std::cerr << "Error: Expected integer literal or type parameter after '*' in multiple-of type at line " << multipleLiteral.line << std::endl;
			exit(1);
		}
		typeName += "*" + multipleLiteral.value;
	}

	return typeName;
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

std::vector<std::string> Parser::parseGenericArgs()
{
	std::vector<std::string> args;
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
