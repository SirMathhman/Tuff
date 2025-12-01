#include "parser.h"
#include <iostream>

std::shared_ptr<ASTNode> Parser::parseExpectDecl()
{
	consume(TokenType::EXPECT, "Expected 'expect'");
	consume(TokenType::FN, "Expected 'fn' after 'expect'");

	std::string name;
	consume(TokenType::IDENTIFIER, "Expected function name");
	name = tokens[pos - 1].value;

	while (peek().type == TokenType::COLON && peek(1).type == TokenType::COLON)
	{
		advance();
		advance();
		consume(TokenType::IDENTIFIER, "Expected identifier after '::'");
		name += "::" + tokens[pos - 1].value;
	}

	consume(TokenType::LPAREN, "Expected '(' after function name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::EXPECT_DECL;
	node->value = name;

	if (peek().type != TokenType::RPAREN)
	{
		do
		{
			auto paramNode = std::make_shared<ASTNode>();
			paramNode->type = ASTNodeType::IDENTIFIER;
			consume(TokenType::IDENTIFIER, "Expected parameter name");
			paramNode->value = tokens[pos - 1].value;
			consume(TokenType::COLON, "Expected ':' after parameter name");

			// Use parseType to support complex types and lowercase identifiers
			paramNode->inferredType = parseType();
			node->addChild(paramNode);
		} while (match(TokenType::COMMA));
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");
	consume(TokenType::COLON, "Expected ':' after ')'");

	// Use parseType to support complex types and lowercase identifiers
	node->inferredType = parseType();

	consume(TokenType::SEMICOLON, "Expected ';' after expect declaration");

	return node;
}

std::shared_ptr<ASTNode> Parser::parseActualDecl()
{
	consume(TokenType::ACTUAL, "Expected 'actual'");
	consume(TokenType::FN, "Expected 'fn' after 'actual'");

	std::string name;
	consume(TokenType::IDENTIFIER, "Expected function name");
	name = tokens[pos - 1].value;

	while (peek().type == TokenType::COLON && peek(1).type == TokenType::COLON)
	{
		advance();
		advance();
		consume(TokenType::IDENTIFIER, "Expected identifier after '::'");
		name += "::" + tokens[pos - 1].value;
	}

	consume(TokenType::LPAREN, "Expected '(' after function name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::ACTUAL_DECL;
	node->value = name;

	if (peek().type != TokenType::RPAREN)
	{
		do
		{
			auto paramNode = std::make_shared<ASTNode>();
			paramNode->type = ASTNodeType::IDENTIFIER;
			consume(TokenType::IDENTIFIER, "Expected parameter name");
			paramNode->value = tokens[pos - 1].value;
			consume(TokenType::COLON, "Expected ':' after parameter name");

			// Use parseType to support complex types and lowercase identifiers
			paramNode->inferredType = parseType();
			node->addChild(paramNode);
		} while (match(TokenType::COMMA));
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");
	consume(TokenType::COLON, "Expected ':' after ')'");

	// Use parseType to support complex types and lowercase identifiers
	node->inferredType = parseType();

	consume(TokenType::FAT_ARROW, "Expected '=>' after return type");

	if (peek().type == TokenType::LBRACE)
	{
		node->addChild(parseBlock());
	}
	else
	{
		auto expr = parseExpression();
		auto returnNode = std::make_shared<ASTNode>();
		returnNode->type = ASTNodeType::RETURN_STMT;
		returnNode->addChild(expr);
		node->addChild(returnNode);
	}

	match(TokenType::SEMICOLON);

	return node;
}

std::shared_ptr<ASTNode> Parser::parseExternFnDecl()
{
	consume(TokenType::EXTERN, "Expected 'extern'");
	consume(TokenType::FN, "Expected 'fn' after 'extern'");

	std::string name;
	consume(TokenType::IDENTIFIER, "Expected function name");
	name = tokens[pos - 1].value;

	// Handle namespaced function names (e.g., libc::malloc)
	while (peek().type == TokenType::COLON && peek(1).type == TokenType::COLON)
	{
		advance();
		advance();
		consume(TokenType::IDENTIFIER, "Expected identifier after '::'");
		name += "::" + tokens[pos - 1].value;
	}

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::EXTERN_FN_DECL;
	node->value = name;

	// Parse optional generic parameters
	if (peek().type == TokenType::LANGLE || peek().type == TokenType::LESS)
	{
		node->genericParams = parseGenericParams();
	}

	consume(TokenType::LPAREN, "Expected '(' after function name");

	if (peek().type != TokenType::RPAREN)
	{
		do
		{
			auto paramNode = std::make_shared<ASTNode>();
			paramNode->type = ASTNodeType::IDENTIFIER;
			consume(TokenType::IDENTIFIER, "Expected parameter name");
			paramNode->value = tokens[pos - 1].value;
			consume(TokenType::COLON, "Expected ':' after parameter name");

			// Use parseType to support complex types (pointers, etc.)
			paramNode->inferredType = parseType();
			node->addChild(paramNode);
		} while (match(TokenType::COMMA));
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");
	consume(TokenType::COLON, "Expected ':' after ')'");

	// Use parseType to support complex return types
	node->inferredType = parseType();

	consume(TokenType::SEMICOLON, "Expected ';' after extern function declaration");

	return node;
}

std::shared_ptr<ASTNode> Parser::parseExternTypeDecl()
{
	consume(TokenType::TYPE, "Expected 'type'");
	consume(TokenType::EXTERN, "Expected 'extern' after 'type'");

	Token typeName = consume(TokenType::IDENTIFIER, "Expected type name after 'type extern'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::EXTERN_TYPE_DECL;
	node->value = typeName.value;

	consume(TokenType::SEMICOLON, "Expected ';' after extern type declaration");

	return node;
}
