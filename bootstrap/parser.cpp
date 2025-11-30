#include "parser.h"
#include <iostream>

Parser::Parser(const std::vector<Token>& toks) : tokens(toks) {}

Token Parser::peek(int offset) const {
    if (pos + offset >= tokens.size()) return tokens.back();
    return tokens[pos + offset];
}

Token Parser::advance() {
    if (pos < tokens.size()) return tokens[pos++];
    return tokens.back();
}

bool Parser::match(TokenType type) {
    if (peek().type == type) {
        advance();
        return true;
    }
    return false;
}

Token Parser::consume(TokenType type, const std::string& errorMsg) {
    if (peek().type == type) return advance();
    std::cerr << "Parse Error: " << errorMsg << " at line " << peek().line << std::endl;
    exit(1);
}

std::shared_ptr<ASTNode> Parser::parse() {
    auto program = std::make_shared<ASTNode>();
    program->type = ASTNodeType::PROGRAM;

    while (peek().type != TokenType::END_OF_FILE) {
        // Check if it's a statement or a trailing expression
        // Heuristic: LET is definitely a statement.
        // IDENTIFIER could be assignment (stmt) or expression.
        // For now, if it's LET, parse stmt.
        // If it's IDENTIFIER followed by EQUALS, parse assignment stmt.
        // Otherwise, try to parse expression and if it's the last thing, good.
        
        if (peek().type == TokenType::LET) {
            program->addChild(parseLetStatement());
        } else if (peek().type == TokenType::IDENTIFIER && peek(1).type == TokenType::EQUALS) {
             program->addChild(parseAssignmentStatement());
        } else {
            // Assume expression
            auto expr = parseExpression();
            // If followed by semicolon, it's an expression statement (which we might ignore or treat as void)
            // But for "Program is expression", it should be the last thing.
            if (match(TokenType::SEMICOLON)) {
                // Expression statement, maybe warn or allow?
                // For now, let's just add it.
                program->addChild(expr); 
            } else {
                // Trailing expression
                program->addChild(expr);
                if (peek().type != TokenType::END_OF_FILE) {
                    std::cerr << "Error: Trailing expression must be the last element." << std::endl;
                    exit(1);
                }
                break;
            }
        }
    }
    return program;
}

std::shared_ptr<ASTNode> Parser::parseLetStatement() {
    consume(TokenType::LET, "Expected 'let'");
    bool isMut = match(TokenType::MUT);
    Token name = consume(TokenType::IDENTIFIER, "Expected variable name");
    
    std::string typeName = "Inferred";
    if (match(TokenType::COLON)) {
        // Parse type
        // For now, just simple types like I32
        if (match(TokenType::I32)) typeName = "I32";
        else if (match(TokenType::BOOL)) typeName = "Bool";
        else consume(TokenType::IDENTIFIER, "Expected type"); // Placeholder
    }

    consume(TokenType::EQUALS, "Expected '='");
    auto init = parseExpression();
    consume(TokenType::SEMICOLON, "Expected ';'");

    auto node = std::make_shared<ASTNode>();
    node->type = ASTNodeType::LET_STMT;
    node->value = name.value;
    node->isMutable = isMut;
    node->inferredType = typeName;
    node->addChild(init);
    return node;
}

std::shared_ptr<ASTNode> Parser::parseAssignmentStatement() {
    Token name = consume(TokenType::IDENTIFIER, "Expected variable name");
    consume(TokenType::EQUALS, "Expected '='");
    auto value = parseExpression();
    consume(TokenType::SEMICOLON, "Expected ';'");

    auto node = std::make_shared<ASTNode>();
    node->type = ASTNodeType::ASSIGNMENT_STMT;
    node->value = name.value;
    node->addChild(value);
    return node;
}

std::shared_ptr<ASTNode> Parser::parseExpression() {
    return parsePrimary();
}

std::shared_ptr<ASTNode> Parser::parsePrimary() {
    if (match(TokenType::INT_LITERAL)) {
        auto node = std::make_shared<ASTNode>();
        node->type = ASTNodeType::LITERAL;
        node->value = tokens[pos-1].value;
        node->inferredType = "I32";
        return node;
    } else if (match(TokenType::IDENTIFIER)) {
        auto node = std::make_shared<ASTNode>();
        node->type = ASTNodeType::IDENTIFIER;
        node->value = tokens[pos-1].value;
        return node;
    }
    std::cerr << "Unexpected token in expression: " << peek().value << std::endl;
    exit(1);
}
