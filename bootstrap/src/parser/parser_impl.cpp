#include "parser.h"
#include <iostream>

std::shared_ptr<ASTNode> Parser::parseImplBlock()
{
	consume(TokenType::IMPL, "Expected 'impl'");

	auto node = std::make_shared<ASTNode>();
	node->type = ASTNodeType::IMPL_DECL;

	// Parse optional generic params: <T, U>
	node->genericParams = parseGenericParams();

	// Parse struct type: Vector<T> or Struct<T>
	node->typeNode = parseType();

	// Extract struct name from type node
	// For simple case like Vector<T>, the typeNode->value is the struct name
	if (node->typeNode && !node->typeNode->value.empty())
	{
		node->value = node->typeNode->value; // Store struct name on impl node
	}

	consume(TokenType::LBRACE, "Expected '{' after struct type in impl block");

	// Parse methods
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		if (peek().type == TokenType::FN)
		{
			auto method = parseFunctionDecl();
			node->addChild(method);
		}
		else
		{
			error("Expected function declaration in impl block");
		}
	}

	consume(TokenType::RBRACE, "Expected '}' after impl block");

	return node;
}
