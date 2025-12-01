#include "parser.h"
#include <iostream>

std::shared_ptr<ASTNode> Parser::parseModuleDecl()
{
	consume(TokenType::MODULE, "Expected 'module'");

	// Parse module name (with :: separators, e.g., com::example)
	std::string moduleName;
	moduleName += consume(TokenType::IDENTIFIER, "Expected module name after 'module' keyword").value;

	while (peek().type == TokenType::DOUBLE_COLON)
	{
		advance(); // consume ::
		moduleName += "::";
		moduleName += consume(TokenType::IDENTIFIER, "Expected identifier after '::' in module path").value;
	}

	auto moduleNode = std::make_shared<ASTNode>();
	moduleNode->type = ASTNodeType::MODULE_DECL;
	moduleNode->value = moduleName;

	// Expect opening brace
	consume(TokenType::LBRACE, "Expected '{' after module name");

	// Parse statements inside module block
	while (peek().type != TokenType::RBRACE && peek().type != TokenType::END_OF_FILE)
	{
		if (peek().type == TokenType::FN)
		{
			moduleNode->addChild(parseFunctionDecl());
		}
		else if (peek().type == TokenType::STRUCT)
		{
			moduleNode->addChild(parseStructDecl());
		}
		else if (peek().type == TokenType::ENUM)
		{
			moduleNode->addChild(parseEnumDecl());
		}
		else if (peek().type == TokenType::TYPE)
		{
			moduleNode->addChild(parseTypeAlias());
		}
		else if (peek().type == TokenType::EXPECT)
		{
			moduleNode->addChild(parseExpectDecl());
		}
		else if (peek().type == TokenType::ACTUAL)
		{
			moduleNode->addChild(parseActualDecl());
		}
		else if (peek().type == TokenType::LET)
		{
			moduleNode->addChild(parseLetStatement());
		}
		else if (peek().type == TokenType::IF)
		{
			moduleNode->addChild(parseIfStatement());
		}
		else if (peek().type == TokenType::WHILE)
		{
			moduleNode->addChild(parseWhileStatement());
		}
		else if (peek().type == TokenType::LOOP)
		{
			moduleNode->addChild(parseLoopStatement());
		}
		else if (peek().type == TokenType::BREAK)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::BREAK_STMT;
			moduleNode->addChild(node);
			match(TokenType::SEMICOLON);
		}
		else if (peek().type == TokenType::CONTINUE)
		{
			advance();
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::CONTINUE_STMT;
			moduleNode->addChild(node);
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
			moduleNode->addChild(node);
			match(TokenType::SEMICOLON);
		}
		else
		{
			std::cerr << "Unexpected token in module block: " << peek().value << " at line "
								<< peek().line << std::endl;
			exit(1);
		}
	}

	consume(TokenType::RBRACE, "Expected '}' after module body");

	return moduleNode;
}

std::shared_ptr<ASTNode> Parser::parseUseDecl()
{
	consume(TokenType::USE, "Expected 'use'");

	// Parse module path (with :: separators, e.g., com::example)
	std::string modulePath;
	modulePath += consume(TokenType::IDENTIFIER, "Expected module path after 'use' keyword").value;

	while (peek().type == TokenType::DOUBLE_COLON)
	{
		advance(); // consume ::
		modulePath += "::";
		modulePath += consume(TokenType::IDENTIFIER, "Expected identifier after '::' in use path").value;
	}

	consume(TokenType::SEMICOLON, "Expected ';' after use declaration");

	auto useNode = std::make_shared<ASTNode>();
	useNode->type = ASTNodeType::USE_DECL;
	useNode->value = modulePath;

	return useNode;
}
