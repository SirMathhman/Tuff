#include "parser.h"
#include <iostream>

std::vector<std::shared_ptr<ASTNode>> Parser::parseGenericParams()
{
	std::vector<std::shared_ptr<ASTNode>> params;
	if (match(TokenType::LESS))
	{
		while (peek().type != TokenType::GREATER && peek().type != TokenType::END_OF_FILE)
		{
			auto paramName = consume(TokenType::IDENTIFIER, "Expected type parameter name");
			auto paramNode = std::make_shared<ASTNode>();
			paramNode->type = ASTNodeType::TYPE_PARAM_DECL;
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
