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
		else if (peek().type == TokenType::TYPE)
		{
			program->addChild(parseTypeAlias());
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

// Expression parsing functions are in parser_expressions.cpp