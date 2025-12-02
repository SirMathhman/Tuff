#include "parser.h"
#include <iostream>

// Primary expressions: literals, identifiers, struct literals, control flow expressions

std::shared_ptr<ASTNode> Parser::parsePrimary()
{
	if (match(TokenType::INT_LITERAL))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		Token token = tokens[pos - 1];
		std::string literal = token.value;
		node->value = literal;
		node->line = token.line;
		node->column = token.column;

		// Check for type suffix (e.g., 42I64, 0USize)
		std::string inferredType = "I32"; // Default
		if (literal.find("I8") != std::string::npos)
			inferredType = "I8";
		else if (literal.find("I16") != std::string::npos)
			inferredType = "I16";
		else if (literal.find("I32") != std::string::npos)
			inferredType = "I32";
		else if (literal.find("I64") != std::string::npos)
			inferredType = "I64";
		else if (literal.find("U8") != std::string::npos)
			inferredType = "U8";
		else if (literal.find("U16") != std::string::npos)
			inferredType = "U16";
		else if (literal.find("U32") != std::string::npos)
			inferredType = "U32";
		else if (literal.find("U64") != std::string::npos)
			inferredType = "U64";
		else if (literal.find("USize") != std::string::npos)
			inferredType = "USize";
		else if (literal.find("F32") != std::string::npos)
			inferredType = "F32";
		else if (literal.find("F64") != std::string::npos)
			inferredType = "F64";

		node->inferredType = inferredType;

		// Set exprType
		if (inferredType == "I8")
			node->exprType = makePrimitive(PrimitiveKind::I8);
		else if (inferredType == "I16")
			node->exprType = makePrimitive(PrimitiveKind::I16);
		else if (inferredType == "I32")
			node->exprType = makePrimitive(PrimitiveKind::I32);
		else if (inferredType == "I64")
			node->exprType = makePrimitive(PrimitiveKind::I64);
		else if (inferredType == "U8")
			node->exprType = makePrimitive(PrimitiveKind::U8);
		else if (inferredType == "U16")
			node->exprType = makePrimitive(PrimitiveKind::U16);
		else if (inferredType == "U32")
			node->exprType = makePrimitive(PrimitiveKind::U32);
		else if (inferredType == "U64")
			node->exprType = makePrimitive(PrimitiveKind::U64);
		else if (inferredType == "USize")
			node->exprType = makePrimitive(PrimitiveKind::USize);
		else if (inferredType == "F32")
			node->exprType = makePrimitive(PrimitiveKind::F32);
		else if (inferredType == "F64")
			node->exprType = makePrimitive(PrimitiveKind::F64);

		return node;
	}
	else if (match(TokenType::STRING_LITERAL))
	{
		// String literal: "hello" → string type (maps to const char* in C++)
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::STRING_LITERAL;
		Token token = tokens[pos - 1];
		node->value = token.value;
		node->line = token.line;
		node->column = token.column;
		node->inferredType = "string";
		// exprType will be set by type checker if needed
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
		// We can't determine type here easily without checking children types
		// TypeChecker will handle it
		return node;
	}
	else if (match(TokenType::TRUE))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		node->value = "true";
		node->inferredType = "Bool";
		node->exprType = makePrimitive(PrimitiveKind::Bool);
		return node;
	}
	else if (match(TokenType::FALSE))
	{
		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::LITERAL;
		node->value = "false";
		node->inferredType = "Bool";
		node->exprType = makePrimitive(PrimitiveKind::Bool);
		return node;
	}
	else if (match(TokenType::SIZEOF))
	{
		// sizeOf(Type) - parse the type parameter
		consume(TokenType::LPAREN, "Expected '(' after 'sizeOf'");
		auto typeNode = parseType();
		std::string typeName = typeToString(typeNode);
		consume(TokenType::RPAREN, "Expected ')' after sizeOf type parameter");

		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::SIZEOF_EXPR;
		node->value = typeName;				// Store the type we're getting size of
		node->typeNode = typeNode;		// Store AST node
		node->inferredType = "USize"; // sizeOf always returns USize
		node->exprType = makePrimitive(PrimitiveKind::USize);
		return node;
	}
	else if (match(TokenType::MATCH))
	{
		return parseMatchExpr();
	}
	else if (match(TokenType::IF))
	{
		// If expression: if (cond) expr else expr
		consume(TokenType::LPAREN, "Expected '(' after 'if'");
		auto condition = parseExpression();
		consume(TokenType::RPAREN, "Expected ')' after condition");

		// Parse then branch - could be a block or expression
		std::shared_ptr<ASTNode> thenBranch;
		if (peek().type == TokenType::LBRACE)
			thenBranch = parseBlock();
		else
			thenBranch = parseExpression();

		consume(TokenType::ELSE, "If expressions must have 'else' clause");

		// Parse else branch - could be a block or expression
		std::shared_ptr<ASTNode> elseBranch;
		if (peek().type == TokenType::LBRACE)
			elseBranch = parseBlock();
		else
			elseBranch = parseExpression();

		auto node = std::make_shared<ASTNode>();
		node->type = ASTNodeType::IF_EXPR;
		node->addChild(condition);
		node->addChild(thenBranch);
		node->addChild(elseBranch);
		return node;
	}
	else if (match(TokenType::IDENTIFIER))
	{
		Token token = tokens[pos - 1];
		std::string name = token.value;

		// Check for FQN: name::name::...
		while (peek().type == TokenType::DOUBLE_COLON)
		{
			advance(); // consume ::
			name += "::";
			name += consume(TokenType::IDENTIFIER, "Expected identifier after '::'").value;
		}

		// Check for generic args
		std::vector<std::string> genArgs;
		std::vector<std::shared_ptr<ASTNode>> genArgsNodes;
		if (isGenericInstantiation())
		{
			genArgsNodes = parseGenericArgs();
			for (auto &arg : genArgsNodes)
			{
				genArgs.push_back(typeToString(arg));
			}
		}

		// Check for struct literal: TypeName { expr, expr, ... }
		// BUT be careful not to consume the start of a block if this identifier is just a variable
		// e.g. "return x;" inside a block shouldn't parse "x {" as a struct literal if { starts a new block
		// Actually, struct literals are expressions, so if we are parsing an expression and see { it must be a struct literal
		// UNLESS we are in a statement context where { starts a block.
		// But parseExpression() is called for expressions.
		// The ambiguity is:
		// if (cond) Ident { ... }  -> Struct literal
		// fn f() => Ident { ... }  -> Struct literal
		// Ident { ... }            -> Statement starting with struct literal? Or block?

		if (peek().type == TokenType::LBRACE)
		{
			// Lookahead to see if it looks like a struct literal (fields) or a block (statements)
			// Struct literal: { expr, expr }
			// Block: { stmt; stmt; }
			// This is hard to distinguish without backtracking or more context.
			// For now, assume if we are parsing an expression, Ident { is a struct literal.

			advance(); // consume '{'
			auto node = std::make_shared<ASTNode>();
			node->type = ASTNodeType::STRUCT_LITERAL;
			node->value = name; // struct type name
			node->genericArgs = genArgs;
			node->genericArgsNodes = genArgsNodes;

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
			node->line = token.line;
			node->column = token.column;
			node->genericArgs = genArgs;
			node->genericArgsNodes = genArgsNodes;
			return node;
		}
	}
	else if (match(TokenType::LPAREN))
	{
		auto expr = parseExpression();
		consume(TokenType::RPAREN, "Expected ')'");
		return expr;
	}
	std::cerr << "Parse Error: Unexpected token '" << peek().value << "' at line " << peek().line
						<< " (expected a literal, identifier, or expression)" << std::endl;
	exit(1);
}
