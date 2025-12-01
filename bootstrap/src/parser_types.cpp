#include "parser.h"
#include <iostream>

// Helper to check if identifier is a lifetime (lowercase first char)
static bool isLifetimeParam(const std::string &name)
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
	// Handle destructor types: ~DestructorName
	if (match(TokenType::TILDE))
	{
		Token destructorName = consume(TokenType::IDENTIFIER, "Expected destructor name after '~'");
		return "~" + destructorName.value;
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

	// Handle array types: [T; init; capacity]
	if (match(TokenType::LBRACKET))
	{
		std::string elementType = parseSingleType();
		consume(TokenType::SEMICOLON, "Expected ';' after array element type");

		Token initToken = consume(TokenType::INT_LITERAL, "Expected init count in array type");
		std::string init = initToken.value;

		consume(TokenType::SEMICOLON, "Expected ';' after init count");

		Token capacityToken = consume(TokenType::INT_LITERAL, "Expected capacity in array type");
		std::string capacity = capacityToken.value;

		consume(TokenType::RBRACKET, "Expected ']' after array type");

		return "[" + elementType + "; " + init + "; " + capacity + "]";
	}

	Token typeToken = advance();
	if (typeToken.type != TokenType::IDENTIFIER &&
			typeToken.type != TokenType::I32 && typeToken.type != TokenType::BOOL &&
			typeToken.type != TokenType::I8 && typeToken.type != TokenType::I16 &&
			typeToken.type != TokenType::I64 && typeToken.type != TokenType::U8 &&
			typeToken.type != TokenType::U16 && typeToken.type != TokenType::U32 &&
			typeToken.type != TokenType::U64 && typeToken.type != TokenType::F32 &&
			typeToken.type != TokenType::F64 && typeToken.type != TokenType::VOID)
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
