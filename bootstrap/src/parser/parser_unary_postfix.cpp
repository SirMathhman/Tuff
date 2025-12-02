#include "parser.h"

// Unary and postfix expression parsing
// Unary: !, -, &, &mut, *
// Postfix: field access (.), indexing ([]), function calls (())

std::shared_ptr<ASTNode> Parser::parseUnary()
{
	if (match(TokenType::NOT) || match(TokenType::MINUS))
	{
		Token op = tokens[pos - 1];
		auto operand = parseUnary();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::UNARY_OP;
		node->value = op.value;
		node->addChild(operand);
		return node;
	}
	// Handle reference: &x or &mut x
	if (match(TokenType::AMPERSAND))
	{
		Token op = tokens[pos - 1];
		bool isMutable = match(TokenType::MUT);
		auto operand = parseUnary();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::REFERENCE_EXPR;
		node->isMutable = isMutable;
		node->line = op.line;
		node->column = op.column;
		node->addChild(operand);
		return node;
	}
	// Handle dereference: *p
	if (match(TokenType::STAR))
	{
		Token op = tokens[pos - 1];
		auto operand = parseUnary();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::DEREF_EXPR;
		node->line = op.line;
		node->column = op.column;
		node->addChild(operand);
		return node;
	}
	return parsePostfix();
}

std::shared_ptr<ASTNode> Parser::parsePostfix()
{
	auto expr = parsePrimary();

	// Handle postfix operations
	while (true)
	{
		if (match(TokenType::DOT))
		{
			// Field access (obj.field) or enum value (EnumName.Variant)
			// Type checker will determine which based on left side type
			Token dot = tokens[pos - 1];
			auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name after '.'");
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::FIELD_ACCESS;
			node->value = fieldName.value;
			node->line = dot.line;
			node->column = dot.column;
			node->addChild(expr);
			expr = node;
		}
		else if (match(TokenType::LBRACKET))
		{
			// Array/pointer indexing: arr[i]
			Token bracket = tokens[pos - 1];
			auto index = parseExpression();
			consume(TokenType::RBRACKET, "Expected ']' after index");
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::INDEX_EXPR;
			node->line = bracket.line;
			node->column = bracket.column;
			node->addChild(expr);
			node->addChild(index);
			expr = node;
		}
		else if (peek().type == TokenType::LPAREN)
		{
			// Function call: expr(args)
			Token paren = advance(); // consume '('
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::CALL_EXPR;
			node->line = paren.line;
			node->column = paren.column;
			node->addChild(expr); // callee

			// Parse arguments
			while (peek().type != TokenType::RPAREN && peek().type != TokenType::END_OF_FILE)
			{
				node->addChild(parseExpression());
				if (!match(TokenType::COMMA))
				{
					break;
				}
			}

			consume(TokenType::RPAREN, "Expected ')' after function arguments");
			expr = node;
		}
		else
		{
			break;
		}
	}

	return expr;
}
