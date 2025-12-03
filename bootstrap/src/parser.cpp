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
		// Check for 'out' keyword prefix for exported declarations
		bool isExported = false;
		if (peek().type == TokenType::OUT)
		{
			advance(); // consume 'out'
			isExported = true;
		}

		if (peek().type == TokenType::FN)
		{
			auto funcDecl = parseFunctionDecl();
			funcDecl->isExported = isExported;
			program->addChild(funcDecl);
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
		else if (peek().type == TokenType::EXTERN)
		{
			// extern use, extern fn, or extern type
			if (peek(1).type == TokenType::USE)
			{
				program->addChild(parseExternUseDecl());
			}
			else if (peek(1).type == TokenType::TYPE)
			{
				program->addChild(parseExternTypeDecl());
			}
			else
			{
				program->addChild(parseExternFnDecl());
			}
		}
		else if (peek().type == TokenType::STRUCT)
		{
			auto structDecl = parseStructDecl();
			structDecl->isExported = isExported;
			program->addChild(structDecl);
		}
		else if (peek().type == TokenType::ENUM)
		{
			auto enumDecl = parseEnumDecl();
			enumDecl->isExported = isExported;
			program->addChild(enumDecl);
		}
		else if (peek().type == TokenType::TYPE)
		{
			auto typeAlias = parseTypeAlias();
			typeAlias->isExported = isExported;
			program->addChild(typeAlias);
		}
		else if (peek().type == TokenType::IMPL)
		{
			if (isExported)
			{
				error("'out' keyword cannot be used with 'impl' blocks", "impl MyStruct { ... }");
			}
			program->addChild(parseImplBlock());
		}
		else if (peek().type == TokenType::LET)
		{
			if (isExported)
			{
				error("'out' keyword cannot be used with let statements", "out fn myFunction() => ...");
			}
			program->addChild(parseLetStatement());
		}
		else if (peek().type == TokenType::IN)
		{
			if (isExported)
			{
				error("'out' keyword cannot be used with in statements", "out fn myFunction() => ...");
			}
			program->addChild(parseInLetStatement());
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
			if (isExported)
			{
				error("'out' keyword cannot be used with statements", "out fn myFunction() => ...");
			}
			program->addChild(parseAssignmentStatement());
		}
		else if (peek().type == TokenType::LBRACE)
		{
			if (isExported)
			{
				error("'out' keyword cannot be used with blocks", "out fn myFunction() => ...");
			}
			program->addChild(parseBlock());
		}
		else
		{
			if (isExported)
			{
				error("'out' keyword must be followed by fn, struct, enum, or type declaration", 
							"out fn myFunction() => ...");
			}
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
					std::cerr << "Error: Trailing expression must be the last element at line " << peek().line << "." << std::endl;
					std::cerr << "       Found unexpected token: " << peek().value << std::endl;
					std::cerr << "       Hint: Did you forget a semicolon, or have statements after a return/expression?" << std::endl;
					exit(1);
				}
				break;
			}
		}
	}
	return program;
}

// Expression parsing functions are in parser_expressions.cpp