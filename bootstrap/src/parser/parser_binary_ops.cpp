#include "parser.h"
#include <iostream>

// Binary operator parsing functions following precedence climbing
// Order: Logical OR -> Logical AND -> Equality -> Is -> Comparison -> Additive -> Bitwise AND -> Multiplicative

std::shared_ptr<ASTNode> Parser::parseExpression()
{
	return parseLogicalOr();
}

std::shared_ptr<ASTNode> Parser::parseLogicalOr()
{
	auto left = parseLogicalAnd();
	while (match(TokenType::OR_OR))
	{
		Token op = tokens[pos - 1];
		auto right = parseLogicalAnd();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseLogicalAnd()
{
	auto left = parseEquality();
	while (match(TokenType::AND_AND))
	{
		Token op = tokens[pos - 1];
		auto right = parseEquality();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseEquality()
{
	auto left = parseIsCheck();
	while (match(TokenType::EQUAL_EQUAL) || match(TokenType::NOT_EQUAL))
	{
		Token op = tokens[pos - 1];
		auto right = parseIsCheck();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseIsCheck()
{
	auto left = parseComparison();
	while (match(TokenType::IS))
	{
		// is operator: expr is Type
		auto targetTypeNode = parseType();
		std::string targetType = typeToString(targetTypeNode);
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::IS_EXPR;
		node->value = targetType;				 // Store the type we're checking against
		node->typeNode = targetTypeNode; // Store AST node
		node->addChild(left);
		node->data = IsExprNode{left, targetTypeNode};
		left = node;
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseComparison()
{
	auto left = parseAdditive();
	while (match(TokenType::LESS) || match(TokenType::GREATER) ||
				 match(TokenType::LESS_EQUAL) || match(TokenType::GREATER_EQUAL))
	{
		Token op = tokens[pos - 1];
		auto right = parseAdditive();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseAdditive()
{
	auto left = parseBitwiseAnd();
	while (match(TokenType::PLUS) || match(TokenType::MINUS))
	{
		Token op = tokens[pos - 1];
		auto right = parseBitwiseAnd();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseBitwiseAnd()
{
	auto left = parseMultiplicative();
	while (match(TokenType::AMPERSAND))
	{
		Token op = tokens[pos - 1];
		auto right = parseMultiplicative();
		left = makeBinaryOpNode("&", left, right, op.line, op.column);
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseMultiplicative()
{
	auto left = parseUnary();
	while (match(TokenType::STAR) || match(TokenType::SLASH) || match(TokenType::PERCENT))
	{
		Token op = tokens[pos - 1];
		auto right = parseUnary();
		left = makeBinaryOpNode(op.value, left, right, op.line, op.column);
	}
	return left;
}
