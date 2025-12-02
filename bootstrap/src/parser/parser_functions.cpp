#include "parser.h"

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
		// Allow 'this' as a parameter name (special case)
		Token paramName;
		if (peek().type == TokenType::THIS)
		{
			paramName = advance();
			paramName.value = "this"; // Ensure value is "this"
		}
		else
		{
			paramName = consume(TokenType::IDENTIFIER, "Expected parameter name");
		}
		consume(TokenType::COLON, "Expected ':' after parameter name");

		// Parse parameter type
		auto paramTypeNode = parseType();
		std::string paramType = typeToString(paramTypeNode);

		// Check for type bound: Type < expr
		std::string typeBound;
		if (peek().type == TokenType::LESS || peek().type == TokenType::LANGLE)
		{
			advance(); // consume <
			// For now, just consume tokens until we hit , or )
			// Full expression parsing would go here
			int depth = 0; // Start at 0 since we already consumed the first <
			while (peek().type != TokenType::END_OF_FILE)
			{
				if (peek().type == TokenType::LESS || peek().type == TokenType::LANGLE)
					depth++;
				else if (peek().type == TokenType::GREATER || peek().type == TokenType::RANGLE)
				{
					if (depth > 0)
						depth--;
				}
				else if (depth == 0 && (peek().type == TokenType::COMMA || peek().type == TokenType::RPAREN))
					break;

				// Stop if we hit the start of the function body
				if (peek().type == TokenType::FAT_ARROW || peek().type == TokenType::LBRACE)
					break;

				typeBound += advance().value + " ";
			}
		}

		// Create parameter node (name in value, type in inferredType)
		auto paramNode = std::make_shared<ASTNode>();
		paramNode->type = ASTNodeType::IDENTIFIER;
		paramNode->value = paramName.value;
		paramNode->inferredType = paramType;
		paramNode->typeNode = paramTypeNode; // Store AST node
		paramNode->typeBound = typeBound;		 // Store the bound expression
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
		node->returnTypeNode = parseType();
		returnType = typeToString(node->returnTypeNode);
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
		if (peek().type == TokenType::SEMICOLON)
		{
			advance(); // consume ;
		}
		else if (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
		{
			// Only error if we're not at the end of a block or file
			error("Expected ';' after expression body",
						"Expression-body functions need semicolons: fn f() => expr; Block-body functions don't: fn f() => { ... }");
		}

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
