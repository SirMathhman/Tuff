#include "parser.h"
#include <iostream>

std::shared_ptr<ASTNode> Parser::parseEnumDecl()
{
	consume(TokenType::ENUM, "Expected 'enum'");
	auto enumName = consume(TokenType::IDENTIFIER, "Expected enum name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::ENUM_DECL;
	node->value = enumName.value;

	consume(TokenType::LBRACE, "Expected '{' after enum name");

	// Parse variants: Variant1, Variant2, ...
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		auto variantName = consume(TokenType::IDENTIFIER, "Expected variant name");

		// Create variant node
		auto variantNode = std::make_shared<ASTNode>();
		variantNode->type = ASTNodeType::IDENTIFIER;
		variantNode->value = variantName.value;
		node->addChild(variantNode);

		if (!match(TokenType::COMMA))
		{
			break;
		}
	}

	consume(TokenType::RBRACE, "Expected '}' after enum variants");
	return node;
}

std::shared_ptr<ASTNode> Parser::parseFunctionDecl()
{
	consume(TokenType::FN, "Expected 'fn'");
	auto funcName = consume(TokenType::IDENTIFIER, "Expected function name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::FUNCTION_DECL;
	node->value = funcName.value;

	// Parse generic params <T, U>
	node->genericParams = parseGenericParams();

	consume(TokenType::LPAREN, "Expected '(' after function name");

	// Parse parameters: name: Type, name: Type, ...
	while (peek().type != TokenType::RPAREN && peek().type != TokenType::END_OF_FILE)
	{
		auto paramName = consume(TokenType::IDENTIFIER, "Expected parameter name");
		consume(TokenType::COLON, "Expected ':' after parameter name");

		// Parse parameter type
		std::string paramType = parseType();

		// Create parameter node (name in value, type in inferredType)
		auto paramNode = std::make_shared<ASTNode>();
		paramNode->type = ASTNodeType::IDENTIFIER;
		paramNode->value = paramName.value;
		paramNode->inferredType = paramType;
		node->addChild(paramNode);

		if (!match(TokenType::COMMA))
		{
			break;
		}
	}

	consume(TokenType::RPAREN, "Expected ')' after parameters");

	// Parse optional return type: `: Type` or default to Void
	std::string returnType = "Void";
	if (match(TokenType::COLON))
	{
		returnType = parseType();
	}
	node->inferredType = returnType; // Store return type

	consume(TokenType::FAT_ARROW, "Expected '=>' after function signature");

	// Parse body: either { block } or single expression
	if (peek().type == TokenType::LBRACE)
	{
		node->addChild(parseBlock());
	}
	else
	{
		// Expression body: fn add(x: I32, y: I32): I32 => x + y;
		auto expr = parseExpression();
		consume(TokenType::SEMICOLON, "Expected ';' after expression body");

		// Wrap expression in implicit return
		auto returnNode = std::make_shared<ASTNode>();
		returnNode->type = ASTNodeType::RETURN_STMT;
		returnNode->addChild(expr);

		// Wrap in block
		auto blockNode = std::make_shared<ASTNode>();
		blockNode->type = ASTNodeType::BLOCK;
		blockNode->addChild(returnNode);
		node->addChild(blockNode);
	}

	return node;
}

std::shared_ptr<ASTNode> Parser::parseStructDecl()
{
	consume(TokenType::STRUCT, "Expected 'struct'");
	auto structName = consume(TokenType::IDENTIFIER, "Expected struct name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::STRUCT_DECL;
	node->value = structName.value;

	// Parse generic params <T>
	node->genericParams = parseGenericParams();

	consume(TokenType::LBRACE, "Expected '{' after struct name");

	// Parse fields: field_name: Type, ...
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name");
		consume(TokenType::COLON, "Expected ':' after field name");

		// Field type
		std::string fieldType = parseType();

		// Create a field node (name in value, type in inferredType)
		auto fieldNode = std::make_shared<ASTNode>();
		fieldNode->type = ASTNodeType::IDENTIFIER;
		fieldNode->value = fieldName.value;
		fieldNode->inferredType = fieldType;
		node->addChild(fieldNode);

		if (!match(TokenType::COMMA))
		{
			break;
		}
	}

	consume(TokenType::RBRACE, "Expected '}' after struct fields");
	return node;
}

std::shared_ptr<ASTNode> Parser::parseLetStatement()
{
	consume(TokenType::LET, "Expected 'let'");
	bool isMut = match(TokenType::MUT);
	Token name = consume(TokenType::IDENTIFIER, "Expected variable name");

	std::string typeName = "Inferred";
	if (match(TokenType::COLON))
	{
		typeName = parseType();
	}

	consume(TokenType::EQUALS, "Expected '='");
	auto init = parseExpression();
	consume(TokenType::SEMICOLON, "Expected ';'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::LET_STMT;
	node->value = name.value;
	node->isMutable = isMut;
	node->inferredType = typeName;
	node->addChild(init);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseAssignmentStatement()
{
	// Parse left-hand side (could be identifier or field access)
	Token name = consume(TokenType::IDENTIFIER, "Expected variable name");

	std::shared_ptr<ASTNode> lhs;

	// Check if it's a field access: x.field = value
	if (peek().type == TokenType::DOT)
	{
		lhs = std::make_shared<ASTNode>();
		lhs->type = ASTNodeType::IDENTIFIER;
		lhs->value = name.value;

		while (match(TokenType::DOT))
		{
			auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name after '.'");
			auto fieldAccess = std::make_shared<ASTNode>();
			fieldAccess->type = ASTNodeType::FIELD_ACCESS;
			fieldAccess->value = fieldName.value;
			fieldAccess->addChild(lhs);
			lhs = fieldAccess;
		}
	}
	else
	{
		// Simple identifier
		lhs = std::make_shared<ASTNode>();
		lhs->type = ASTNodeType::IDENTIFIER;
		lhs->value = name.value;
	}

	consume(TokenType::EQUALS, "Expected '='");
	auto value = parseExpression();
	consume(TokenType::SEMICOLON, "Expected ';'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::ASSIGNMENT_STMT;
	node->addChild(lhs);
	node->addChild(value);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseIfStatement()
{
	consume(TokenType::IF, "Expected 'if'");
	consume(TokenType::LPAREN, "Expected '(' after 'if'");
	auto condition = parseExpression();
	consume(TokenType::RPAREN, "Expected ')' after condition");

	auto thenBranch = parseStatementOrBlock();

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::IF_STMT;
	node->addChild(condition);
	node->addChild(thenBranch);

	if (match(TokenType::ELSE))
	{
		auto elseBranch = parseStatementOrBlock();
		node->addChild(elseBranch);
	}

	return node;
}

std::shared_ptr<ASTNode> Parser::parseWhileStatement()
{
	consume(TokenType::WHILE, "Expected 'while'");
	consume(TokenType::LPAREN, "Expected '(' after 'while'");
	auto condition = parseExpression();
	consume(TokenType::RPAREN, "Expected ')' after condition");

	auto body = parseStatementOrBlock();

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::WHILE_STMT;
	node->addChild(condition);
	node->addChild(body);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseLoopStatement()
{
	consume(TokenType::LOOP, "Expected 'loop'");
	auto body = parseStatementOrBlock();

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::LOOP_STMT;
	node->addChild(body);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseBlock()
{
	consume(TokenType::LBRACE, "Expected '{'");
	auto block = std::make_shared<ASTNode>();
	block->type = ASTNodeType::BLOCK;

	while (!match(TokenType::RBRACE) && peek().type != TokenType::END_OF_FILE)
	{
		if (peek().type == TokenType::STRUCT)
		{
			block->addChild(parseStructDecl());
		}
		else if (peek().type == TokenType::ENUM)
		{
			block->addChild(parseEnumDecl());
		}
		else if (peek().type == TokenType::LET)
		{
			block->addChild(parseLetStatement());
		}
		else if (peek().type == TokenType::IF)
		{
			block->addChild(parseIfStatement());
		}
		else if (peek().type == TokenType::WHILE)
		{
			block->addChild(parseWhileStatement());
		}
		else if (peek().type == TokenType::LOOP)
		{
			block->addChild(parseLoopStatement());
		}
		else if (peek().type == TokenType::BREAK)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::BREAK_STMT;
			block->addChild(node);
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::CONTINUE)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::CONTINUE_STMT;
			block->addChild(node);
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::RETURN)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::RETURN_STMT;
			if (peek().type != TokenType::SEMICOLON && peek().type != TokenType::RBRACE)
			{
				node->addChild(parseExpression());
			}
			match(TokenType::SEMICOLON);
			block->addChild(node);
		}
		else if (peek().type == TokenType::IDENTIFIER && (peek(1).type == TokenType::EQUALS || peek(1).type == TokenType::DOT))
		{
			block->addChild(parseAssignmentStatement());
		}
		else if (peek().type == TokenType::LBRACE)
		{
			block->addChild(parseBlock());
		}
		else
		{
			auto expr = parseExpression();
			match(TokenType::SEMICOLON);
			block->addChild(expr);
		}
	}

	return block;
}

std::shared_ptr<ASTNode> Parser::parseStatementOrBlock()
{
	if (peek().type == TokenType::LBRACE)
	{
		return parseBlock();
	}
	else if (peek().type == TokenType::IF)
	{
		return parseIfStatement();
	}
	else if (peek().type == TokenType::WHILE)
	{
		return parseWhileStatement();
	}
	else if (peek().type == TokenType::LOOP)
	{
		return parseLoopStatement();
	}
	else if (peek().type == TokenType::BREAK)
	{
		advance();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BREAK_STMT;
		match(TokenType::SEMICOLON);
		return node;
	}
	else if (peek().type == TokenType::CONTINUE)
	{
		advance();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::CONTINUE_STMT;
		match(TokenType::SEMICOLON);
		return node;
	}
	else if (peek().type == TokenType::LET)
	{
		return parseLetStatement();
	}
	else if (peek().type == TokenType::IDENTIFIER && (peek(1).type == TokenType::EQUALS || peek(1).type == TokenType::DOT))
	{
		return parseAssignmentStatement();
	}
	else
	{
		auto expr = parseExpression();
		match(TokenType::SEMICOLON);
		return expr;
	}
}
