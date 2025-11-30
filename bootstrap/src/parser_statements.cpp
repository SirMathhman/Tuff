#include "parser.h"
#include <iostream>

std::shared_ptr<ASTNode> Parser::parseStructDecl()
{
	consume(TokenType::STRUCT, "Expected 'struct'");
	auto structName = consume(TokenType::IDENTIFIER, "Expected struct name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::STRUCT_DECL;
	node->value = structName.value;

	consume(TokenType::LBRACE, "Expected '{' after struct name");

	// Parse fields: field_name: Type, ...
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name");
		consume(TokenType::COLON, "Expected ':' after field name");

		// Field type can be an identifier (user-defined type) or type keyword (I32, Bool, etc.)
		Token fieldType = advance();
		if (fieldType.type != TokenType::IDENTIFIER &&
				fieldType.type != TokenType::I32 && fieldType.type != TokenType::BOOL &&
				fieldType.type != TokenType::I8 && fieldType.type != TokenType::I16 &&
				fieldType.type != TokenType::I64 && fieldType.type != TokenType::U8 &&
				fieldType.type != TokenType::U16 && fieldType.type != TokenType::U32 &&
				fieldType.type != TokenType::U64 && fieldType.type != TokenType::F32 &&
				fieldType.type != TokenType::F64 && fieldType.type != TokenType::VOID)
		{
			std::cerr << "Error: Expected field type at line " << fieldType.line << std::endl;
			exit(1);
		}

		// Create a field node (name in value, type in inferredType)
		auto fieldNode = std::make_shared<ASTNode>();
		fieldNode->type = ASTNodeType::IDENTIFIER;
		fieldNode->value = fieldName.value;
		fieldNode->inferredType = fieldType.value;
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
		if (match(TokenType::I32))
			typeName = "I32";
		else if (match(TokenType::BOOL))
			typeName = "Bool";
		else
			consume(TokenType::IDENTIFIER, "Expected type");
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
