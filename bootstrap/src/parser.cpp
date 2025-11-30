#include "parser.h"
#include <iostream>

Parser::Parser(const std::vector<Token> &toks) : tokens(toks) {}

Token Parser::peek(int offset) const
{
	if (pos + offset >= tokens.size())
		return tokens.back();
	return tokens[pos + offset];
}

Token Parser::advance()
{
	if (pos < tokens.size())
		return tokens[pos++];
	return tokens.back();
}

bool Parser::match(TokenType type)
{
	if (peek().type == type)
	{
		advance();
		return true;
	}
	return false;
}

Token Parser::consume(TokenType type, const std::string &errorMsg)
{
	if (peek().type == type)
		return advance();
	std::cerr << "Parse Error: " << errorMsg << " at line " << peek().line << std::endl;
	exit(1);
}

void Parser::error(const std::string &errorMsg, const std::string &syntaxHint)
{
	std::cerr << "Parse Error: " << errorMsg << " at line " << peek().line << std::endl;
	if (!syntaxHint.empty())
	{
		std::cerr << "Syntax: " << syntaxHint << std::endl;
	}
	exit(1);
}

std::shared_ptr<ASTNode> Parser::parse()
{
	auto program = std::make_shared<ASTNode>();
	program->type = ASTNodeType::PROGRAM;

	while (peek().type != TokenType::END_OF_FILE)
	{
		if (peek().type == TokenType::FN)
		{
			program->addChild(parseFunctionDecl());
		}
		else if (peek().type == TokenType::MODULE)
		{
			program->addChild(parseModuleDecl());
		}
		else if (peek().type == TokenType::USE)
		{
			program->addChild(parseUseDecl());
		}
		else if (peek().type == TokenType::EXPECT)
		{
			program->addChild(parseExpectDecl());
		}
		else if (peek().type == TokenType::ACTUAL)
		{
			program->addChild(parseActualDecl());
		}
		else if (peek().type == TokenType::STRUCT)
		{
			program->addChild(parseStructDecl());
		}
		else if (peek().type == TokenType::ENUM)
		{
			program->addChild(parseEnumDecl());
		}
		else if (peek().type == TokenType::LET)
		{
			program->addChild(parseLetStatement());
		}
		else if (peek().type == TokenType::IF)
		{
			program->addChild(parseIfStatement());
		}
		else if (peek().type == TokenType::WHILE)
		{
			program->addChild(parseWhileStatement());
		}
		else if (peek().type == TokenType::LOOP)
		{
			program->addChild(parseLoopStatement());
		}
		else if (peek().type == TokenType::BREAK)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::BREAK_STMT;
			program->addChild(node);
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::CONTINUE)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::CONTINUE_STMT;
			program->addChild(node);
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
			program->addChild(node);
		}
		else if (isAssignmentStatement())
		{
			program->addChild(parseAssignmentStatement());
		}
		else if (peek().type == TokenType::LBRACE)
		{
			program->addChild(parseBlock());
		}
		else
		{
			auto expr = parseExpression();
			if (match(TokenType::SEMICOLON))
			{
				program->addChild(expr);
			}
			else
			{
				program->addChild(expr);
				if (peek().type != TokenType::END_OF_FILE)
				{
					std::cerr << "Error: Trailing expression must be the last element." << std::endl;
					exit(1);
				}
				break;
			}
		}
	}
	return program;
}

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
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
		left = node;
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
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
		left = node;
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseEquality()
{
	auto left = parseComparison();
	while (match(TokenType::EQUAL_EQUAL) || match(TokenType::NOT_EQUAL))
	{
		Token op = tokens[pos - 1];
		auto right = parseComparison();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
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
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
		left = node;
	}
	return left;
}

std::shared_ptr<ASTNode> Parser::parseAdditive()
{
	auto left = parseMultiplicative();
	while (match(TokenType::PLUS) || match(TokenType::MINUS))
	{
		Token op = tokens[pos - 1];
		auto right = parseMultiplicative();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
		left = node;
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
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::BINARY_OP;
		node->value = op.value;
		node->addChild(left);
		node->addChild(right);
		left = node;
	}
	return left;
}

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
		bool isMutable = match(TokenType::MUT);
		auto operand = parseUnary();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::REFERENCE_EXPR;
		node->isMutable = isMutable;
		node->addChild(operand);
		return node;
	}
	// Handle dereference: *p
	if (match(TokenType::STAR))
	{
		auto operand = parseUnary();
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::DEREF_EXPR;
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
			auto fieldName = consume(TokenType::IDENTIFIER, "Expected field name after '.'");
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::FIELD_ACCESS;
			node->value = fieldName.value;
			node->addChild(expr);
			expr = node;
		}
		else if (match(TokenType::LBRACKET))
		{
			// Array/pointer indexing: arr[i]
			auto index = parseExpression();
			consume(TokenType::RBRACKET, "Expected ']' after index");
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::INDEX_EXPR;
			node->addChild(expr);
			node->addChild(index);
			expr = node;
		}
		else if (peek().type == TokenType::LPAREN)
		{
			// Function call: expr(args)
			advance(); // consume '('
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::CALL_EXPR;
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

std::shared_ptr<ASTNode> Parser::parsePrimary()
{
	if (match(TokenType::INT_LITERAL))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		node->value = tokens[pos - 1].value;
		node->inferredType = "I32";
		return node;
	}
	else if (match(TokenType::STRING_LITERAL))
	{
		// String literal: "hello" → [U8; n; n]
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::ARRAY_LITERAL;
		
		std::string str = tokens[pos - 1].value;
		for (unsigned char c : str)
		{
			auto byteNode = std::make_shared<ASTNode>();
			byteNode->type = ASTNodeType::LITERAL;
			byteNode->value = std::to_string((int)c);
			byteNode->inferredType = "U8";
			node->addChild(byteNode);
		}
		
		return node;
	}
	else if (match(TokenType::LBRACKET))
	{
		// Array literal: [1, 2, 3]
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::ARRAY_LITERAL;

		while (peek().type != TokenType::RBRACKET && peek().type != TokenType::END_OF_FILE)
		{
			node->addChild(parseExpression());
			if (!match(TokenType::COMMA))
			{
				break;
			}
		}

		consume(TokenType::RBRACKET, "Expected ']' after array elements");
		return node;
	}
	else if (match(TokenType::TRUE))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		node->value = "true";
		node->inferredType = "Bool";
		return node;
	}
	else if (match(TokenType::FALSE))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		node->value = "false";
		node->inferredType = "Bool";
		return node;
	}
	else if (match(TokenType::IF))
	{
		// If expression: if (cond) expr else expr
		consume(TokenType::LPAREN, "Expected '(' after 'if'");
		auto condition = parseExpression();
		consume(TokenType::RPAREN, "Expected ')' after condition");
		auto thenBranch = parseExpression();
		consume(TokenType::ELSE, "If expressions must have 'else' clause");
		auto elseBranch = parseExpression();

		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::IF_EXPR;
		node->addChild(condition);
		node->addChild(thenBranch);
		node->addChild(elseBranch);
		return node;
	}
	else if (match(TokenType::IDENTIFIER))
	{
		std::string name = tokens[pos - 1].value;

		// Check for FQN: name::name::...
		while (peek().type == TokenType::DOUBLE_COLON)
		{
			advance(); // consume ::
			name += "::";
			name += consume(TokenType::IDENTIFIER, "Expected identifier after '::'").value;
		}

		// Check for generic args
		std::vector<std::string> genArgs;
		if (isGenericInstantiation())
		{
			genArgs = parseGenericArgs();
		}

		// Check for struct literal: TypeName { expr, expr, ... }
		if (peek().type == TokenType::LBRACE)
		{
			advance(); // consume '{'
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::STRUCT_LITERAL;
			node->value = name; // struct type name
			node->genericArgs = genArgs;

			// Parse field initializers
			while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
			{
				auto expr = parseExpression();
				node->addChild(expr);

				if (!match(TokenType::COMMA))
				{
					break;
				}
			}

			if (peek().type != TokenType::RBRACE)
			{
				error("Expected '}' after struct literal",
							"Struct literals use positional fields: Point { x, y } not Point { x: x, y: y }");
			}
			advance(); // consume }
			return node;
		}
		else
		{
			// Just an identifier (possibly with FQN)
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::IDENTIFIER;
			node->value = name;
			node->genericArgs = genArgs;
			return node;
		}
	}
	else if (match(TokenType::LPAREN))
	{
		auto expr = parseExpression();
		consume(TokenType::RPAREN, "Expected ')'");
		return expr;
	}
	std::cerr << "Unexpected token in expression: " << peek().value << std::endl;
	exit(1);
}
