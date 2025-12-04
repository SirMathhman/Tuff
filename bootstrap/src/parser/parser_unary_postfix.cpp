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
		return makeUnaryOpNode(op.value, operand, op.line, op.column);
	}
	// Handle reference: &x or &mut x
	if (match(TokenType::AMPERSAND))
	{
		Token op = tokens[pos - 1];
		bool isMutable = match(TokenType::MUT);
		auto operand = parseUnary();
		return makeReferenceExprNode(operand, isMutable, op.line, op.column);
	}
	// Handle dereference: *p
	if (match(TokenType::STAR))
	{
		Token op = tokens[pos - 1];
		auto operand = parseUnary();
		return makeDerefExprNode(operand, op.line, op.column);
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
			expr = makeFieldAccessNode(expr, fieldName.value, dot.line, dot.column);
		}
		else if (match(TokenType::LBRACKET))
		{
			// Array/pointer indexing: arr[i]
			Token bracket = tokens[pos - 1];
			auto index = parseExpression();
			consume(TokenType::RBRACKET, "Expected ']' after index");
			expr = makeIndexExprNode(expr, index, bracket.line, bracket.column);
		}
		else if (peek().type == TokenType::LPAREN)
		{
			// Function call: expr(args)
			Token paren = advance(); // consume '('
			std::vector<std::shared_ptr<ASTNode>> args;

			// Parse arguments
			while (peek().type != TokenType::RPAREN && peek().type != TokenType::END_OF_FILE)
			{
				args.push_back(parseExpression());
				if (!match(TokenType::COMMA))
				{
					break;
				}
			}

			consume(TokenType::RPAREN, "Expected ')' after function arguments");
			expr = makeCallExprNode(expr, args, paren.line, paren.column);
		}
		else
		{
			break;
		}
	}

	return expr;
}
