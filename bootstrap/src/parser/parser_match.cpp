#include "parser.h"

// Match expression parsing
// Syntax: match expr { Pattern => body, Pattern => body, ... }

std::shared_ptr<ASTNode> Parser::parseMatchExpr()
{
	// match expr { Pattern => expr, Pattern => expr, ... }
	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::MATCH_EXPR;

	// Parse the scrutinee expression
	auto scrutinee = parseExpression();
	node->addChild(scrutinee);

	consume(TokenType::LBRACE, "Expected '{' after match expression");

	// Parse arms
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		auto arm = std::make_shared<ASTNode>();

		// Parse pattern: Type, EnumName.Variant, or _
		if (peek().type == TokenType::IDENTIFIER)
		{
			std::string pattern = advance().value;

			// Check for FQN or enum variant: Type::Variant or EnumName.Variant
			while (peek().type == TokenType::DOUBLE_COLON)
			{
				advance();
				pattern += "::";
				pattern += consume(TokenType::IDENTIFIER, "Expected identifier after '::'").value;
			}

			// Check for enum dot notation: EnumName.Variant
			if (peek().type == TokenType::DOT)
			{
				advance();
				pattern += ".";
				pattern += consume(TokenType::IDENTIFIER, "Expected variant name after '.'").value;
			}

			arm->value = pattern;
		}
		else
		{
			// Expecting a type keyword or wildcard
			Token patternToken = advance();
			if (patternToken.value == "_")
			{
				arm->value = "_";
			}
			else
			{
				// Could be a primitive type like I32, Bool, etc.
				arm->value = patternToken.value;
			}
		}

		consume(TokenType::FAT_ARROW, "Expected '=>' after match pattern");

		// Parse arm body - can be expression or block
		std::shared_ptr<ASTNode> body;
		if (peek().type == TokenType::LBRACE)
		{
			body = parseBlock();
		}
		else
		{
			body = parseExpression();
		}
		arm->addChild(body);

		node->addChild(arm);

		// Optional comma between arms
		match(TokenType::COMMA);
	}

	consume(TokenType::RBRACE, "Expected '}' after match arms");

	return node;
}
