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
	node->inferredType = parseType();

	match(TokenType::SEMICOLON);
	return node;
}

std::shared_ptr<ASTNode> Parser::parseFunctionDecl()
{
	consume(TokenType::FN, "Expected 'fn'");
	auto funcName = consume(TokenType::IDENTIFIER, "Expected function name");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::FUNCTION_DECL;
	node->value = funcName.value;

	// Parse generic params <a, b, T, U> - separates lifetimes from type params
	auto allParams = parseGenericParams();
	for (auto &param : allParams)
	{
		if (param->type == ASTNodeType::LIFETIME_PARAM)
		{
			node->lifetimeParams.push_back(param->value);
		}
		else
		{
			node->genericParams.push_back(param);
		}
	}

	consume(TokenType::LPAREN, "Expected '(' after function name");

	// Parse parameters: name: Type, name: Type, ...
	while (peek().type != TokenType::RPAREN && peek().type != TokenType::END_OF_FILE)
	{
		auto paramName = consume(TokenType::IDENTIFIER, "Expected parameter name");
		consume(TokenType::COLON, "Expected ':' after parameter name");

		// Parse parameter type
		std::string paramType = parseType();
		
		// Check for type bound: Type < expr
		std::string typeBound;
		if (peek().type == TokenType::LESS || peek().type == TokenType::LANGLE)
		{
			advance(); // consume <
			// For now, just consume tokens until we hit , or )
			// Full expression parsing would go here
			int depth = 1;
			while (depth > 0 && peek().type != TokenType::END_OF_FILE)
			{
				if (peek().type == TokenType::LESS || peek().type == TokenType::LANGLE)
					depth++;
				else if (peek().type == TokenType::GREATER || peek().type == TokenType::RANGLE)
					depth--;
				else if (depth == 1 && (peek().type == TokenType::COMMA || peek().type == TokenType::RPAREN))
					break;
				
				typeBound += advance().value + " ";
			}
		}

		// Create parameter node (name in value, type in inferredType)
		auto paramNode = std::make_shared<ASTNode>();
		paramNode->type = ASTNodeType::IDENTIFIER;
		paramNode->value = paramName.value;
		paramNode->inferredType = paramType;
		paramNode->typeBound = typeBound;  // Store the bound expression
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
		if (peek().type != TokenType::SEMICOLON)
		{
			error("Expected ';' after expression body",
						"Expression-body functions need semicolons: fn f() => expr; Block-body functions don't: fn f() => { ... }");
		}
		advance(); // consume ;

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

	lhs = std::make_shared<ASTNode>();
	lhs->type = ASTNodeType::IDENTIFIER;
	lhs->value = name.value;

	// Handle postfix operations: field access and indexing
	while (true)
	{
		if (match(TokenType::DOT))
		{
			auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name after '.'");
			auto fieldAccess = std::make_shared<ASTNode>();
			fieldAccess->type = ASTNodeType::FIELD_ACCESS;
			fieldAccess->value = fieldName.value;
			fieldAccess->addChild(lhs);
			lhs = fieldAccess;
		}
		else if (match(TokenType::LBRACKET))
		{
			auto index = parseExpression();
			consume(TokenType::RBRACKET, "Expected ']' after index");
			auto indexExpr = std::make_shared<ASTNode>();
			indexExpr->type = ASTNodeType::INDEX_EXPR;
			indexExpr->addChild(lhs);
			indexExpr->addChild(index);
			lhs = indexExpr;
		}
		else
		{
			break;
		}
	}

	// Wrap in dereference nodes
	for (int i = 0; i < derefCount; i++)
	{
		auto deref = std::make_shared<ASTNode>();
		deref->type = ASTNodeType::DEREF_EXPR;
		deref->addChild(lhs);
		lhs = deref;
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
