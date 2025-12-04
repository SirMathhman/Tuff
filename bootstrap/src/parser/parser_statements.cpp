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

std::shared_ptr<ASTNode> Parser::parseTypeAlias()
{
	consume(TokenType::TYPE, "Expected 'type'");
	auto aliasName = consume(TokenType::IDENTIFIER, "Expected type alias name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::TYPE_ALIAS;
	node->value = aliasName.value;

	// Parse optional generic params <T, U>
	node->genericParams = parseGenericParams();

	consume(TokenType::EQUALS, "Expected '=' after type alias name");

	// Parse the aliased type
	node->typeNode = parseType();
	node->inferredType = typeToString(node->typeNode);

	match(TokenType::SEMICOLON);
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
		auto fieldTypeNode = parseType();
		std::string fieldType = typeToString(fieldTypeNode);

		// Create a field node (name in value, type in inferredType)
		auto fieldNode = makeIdentifierNode(fieldName.value, fieldName.line, fieldName.column);
		fieldNode->inferredType = fieldType;
		fieldNode->typeNode = fieldTypeNode; // Store AST node
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
	std::shared_ptr<ASTNode> typeNode = nullptr;
	if (match(TokenType::COLON))
	{
		typeNode = parseType();
		typeName = typeToString(typeNode);
	}

	consume(TokenType::EQUALS, "Expected '='");
	auto init = parseExpression();
	consume(TokenType::SEMICOLON, "Expected ';'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::LET_STMT;
	node->value = name.value;
	node->isMutable = isMut;
	node->inferredType = typeName;
	node->typeNode = typeNode; // Store AST node
	node->addChild(init);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseInLetStatement()
{
	consume(TokenType::IN, "Expected 'in'");
	consume(TokenType::LET, "Expected 'let'");
	Token name = consume(TokenType::IDENTIFIER, "Expected variable name");

	consume(TokenType::COLON, "Expected ':'");
	auto typeNode = parseType();
	std::string typeName = typeToString(typeNode);

	consume(TokenType::SEMICOLON, "Expected ';'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::IN_LET_STMT;
	node->value = name.value;
	node->isMutable = false; // 'in let' is always immutable
	node->inferredType = typeName;
	node->typeNode = typeNode;
	return node;
}

bool Parser::isAssignmentStatement()
{
	// Lookahead to detect: *+ identifier (.field | [index])* =
	// or: identifier (.field | [index])* =
	int offset = 0;

	// Handle leading dereference(s): * or multiple *
	while (peek(offset).type == TokenType::STAR)
	{
		offset++;
	}

	// Must have an identifier
	if (peek(offset).type != TokenType::IDENTIFIER)
		return false;

	offset++;
	while (true)
	{
		TokenType t = peek(offset).type;
		if (t == TokenType::DOT)
		{
			// Skip .field
			offset++;
			if (peek(offset).type != TokenType::IDENTIFIER)
				return false;
			offset++;
		}
		else if (t == TokenType::LBRACKET)
		{
			// Skip [index] - need to find matching ]
			offset++;
			int depth = 1;
			while (depth > 0 && peek(offset).type != TokenType::END_OF_FILE)
			{
				if (peek(offset).type == TokenType::LBRACKET)
					depth++;
				else if (peek(offset).type == TokenType::RBRACKET)
					depth--;
				offset++;
			}
		}
		else if (t == TokenType::EQUALS)
		{
			return true;
		}
		else
		{
			return false;
		}
	}
}

std::shared_ptr<ASTNode> Parser::parseAssignmentStatement()
{
	// Parse left-hand side (could be *p, identifier, field access, or index)
	std::shared_ptr<ASTNode> lhs;

	// Handle leading dereferences: *p, **p, etc.
	int derefCount = 0;
	while (match(TokenType::STAR))
	{
		derefCount++;
	}

	Token name = consume(TokenType::IDENTIFIER, "Expected variable name");
	lhs = makeIdentifierNode(name.value, name.line, name.column);

	// Handle postfix operations: field access and indexing
	while (true)
	{
		if (match(TokenType::DOT))
		{
			auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name after '.'");
			lhs = makeFieldAccessNode(lhs, fieldName.value, fieldName.line, fieldName.column);
		}
		else if (match(TokenType::LBRACKET))
		{
			Token bracket = tokens[pos - 1];
			auto index = parseExpression();
			consume(TokenType::RBRACKET, "Expected ']' after index");
			lhs = makeIndexExprNode(lhs, index, bracket.line, bracket.column);
		}
		else
		{
			break;
		}
	}

	// Wrap in dereference nodes
	for (int i = 0; i < derefCount; i++)
	{
		lhs = makeDerefExprNode(lhs);
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
	if (peek().type != TokenType::LPAREN)
	{
		error("Expected '(' after 'if'",
					"If conditions require parentheses: if (condition) { ... }");
	}
	advance(); // consume (
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
	if (peek().type != TokenType::LPAREN)
	{
		error("Expected '(' after 'while'",
					"While conditions require parentheses: while (condition) { ... }");
	}
	advance(); // consume (
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
			Token token = advance();
			block->addChild(makeBreakNode(token.line, token.column));
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::CONTINUE)
		{
			Token token = advance();
			block->addChild(makeContinueNode(token.line, token.column));
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::RETURN)
		{
			Token token = advance();
			std::shared_ptr<ASTNode> retValue = nullptr;
			if (peek().type != TokenType::SEMICOLON && peek().type != TokenType::RBRACE)
			{
				retValue = parseExpression();
			}
			match(TokenType::SEMICOLON);
			block->addChild(makeReturnNode(retValue, token.line, token.column));
		}
		else if (isAssignmentStatement())
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
		Token token = advance();
		match(TokenType::SEMICOLON);
		return makeBreakNode(token.line, token.column);
	}
	else if (peek().type == TokenType::CONTINUE)
	{
		Token token = advance();
		match(TokenType::SEMICOLON);
		return makeContinueNode(token.line, token.column);
	}
	else if (peek().type == TokenType::RETURN)
	{
		Token token = advance();
		std::shared_ptr<ASTNode> retValue = nullptr;
		if (peek().type != TokenType::SEMICOLON && peek().type != TokenType::RBRACE)
		{
			retValue = parseExpression();
		}
		match(TokenType::SEMICOLON);
		return makeReturnNode(retValue, token.line, token.column);
	}
	else if (peek().type == TokenType::LET)
	{
		return parseLetStatement();
	}
	else if (isAssignmentStatement())
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
