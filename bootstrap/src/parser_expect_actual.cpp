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

			Token paramType = advance();
			if (paramType.type != TokenType::IDENTIFIER &&
					paramType.type != TokenType::I32 && paramType.type != TokenType::BOOL &&
					paramType.type != TokenType::I8 && paramType.type != TokenType::I16 &&
					paramType.type != TokenType::I64 && paramType.type != TokenType::U8 &&
					paramType.type != TokenType::U16 && paramType.type != TokenType::U32 &&
					paramType.type != TokenType::U64 && paramType.type != TokenType::F32 &&
					paramType.type != TokenType::F64 && paramType.type != TokenType::VOID)
			{
				std::cerr << "Error: Expected parameter type at line " << paramType.line << std::endl;
				exit(1);
			}
			paramNode->inferredType = paramType.value;
			node->addChild(paramNode);
		} while (match(TokenType::COMMA));
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");
	consume(TokenType::COLON, "Expected ':' after ')'");

	Token retType = advance();
	if (retType.type != TokenType::IDENTIFIER &&
			retType.type != TokenType::I32 && retType.type != TokenType::BOOL &&
			retType.type != TokenType::I8 && retType.type != TokenType::I16 &&
			retType.type != TokenType::I64 && retType.type != TokenType::U8 &&
			retType.type != TokenType::U16 && retType.type != TokenType::U32 &&
			retType.type != TokenType::U64 && retType.type != TokenType::F32 &&
			retType.type != TokenType::F64 && retType.type != TokenType::VOID)
	{
		std::cerr << "Error: Expected return type at line " << retType.line << std::endl;
		exit(1);
	}
	node->inferredType = retType.value;

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

			Token paramType = advance();
			if (paramType.type != TokenType::IDENTIFIER &&
					paramType.type != TokenType::I32 && paramType.type != TokenType::BOOL &&
					paramType.type != TokenType::I8 && paramType.type != TokenType::I16 &&
					paramType.type != TokenType::I64 && paramType.type != TokenType::U8 &&
					paramType.type != TokenType::U16 && paramType.type != TokenType::U32 &&
					paramType.type != TokenType::U64 && paramType.type != TokenType::F32 &&
					paramType.type != TokenType::F64 && paramType.type != TokenType::VOID)
			{
				std::cerr << "Error: Expected parameter type at line " << paramType.line << std::endl;
				exit(1);
			}
			paramNode->inferredType = paramType.value;
			node->addChild(paramNode);
		} while (match(TokenType::COMMA));
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");
	consume(TokenType::COLON, "Expected ':' after ')'");

	Token actualRetType = advance();
	if (actualRetType.type != TokenType::IDENTIFIER &&
			actualRetType.type != TokenType::I32 && actualRetType.type != TokenType::BOOL &&
			actualRetType.type != TokenType::I8 && actualRetType.type != TokenType::I16 &&
			actualRetType.type != TokenType::I64 && actualRetType.type != TokenType::U8 &&
			actualRetType.type != TokenType::U16 && actualRetType.type != TokenType::U32 &&
			actualRetType.type != TokenType::U64 && actualRetType.type != TokenType::F32 &&
			actualRetType.type != TokenType::F64 && actualRetType.type != TokenType::VOID)
	{
		std::cerr << "Error: Expected return type at line " << actualRetType.line << std::endl;
		exit(1);
	}
	node->inferredType = actualRetType.value;

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
