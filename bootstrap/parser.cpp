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
        if (peek().type == TokenType::LET) {
            program->addChild(parseLetStatement());
        } else if (peek().type == TokenType::IDENTIFIER && peek(1).type == TokenType::EQUALS) {
            program->addChild(parseAssignmentStatement());
        } else {
            auto expr = parseExpression();
            if (match(TokenType::SEMICOLON)) {
                program->addChild(expr);
            } else {
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
        if (match(TokenType::I32)) typeName = "I32";
        else if (match(TokenType::BOOL)) typeName = "Bool";
        else consume(TokenType::IDENTIFIER, "Expected type");
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
    return parseLogicalOr();
}

std::shared_ptr<ASTNode> Parser::parseLogicalOr() {
    auto left = parseLogicalAnd();
    while (match(TokenType::OR_OR)) {
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

std::shared_ptr<ASTNode> Parser::parseLogicalAnd() {
    auto left = parseEquality();
    while (match(TokenType::AND_AND)) {
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

std::shared_ptr<ASTNode> Parser::parseEquality() {
    auto left = parseComparison();
    while (match(TokenType::EQUAL_EQUAL) || match(TokenType::NOT_EQUAL)) {
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

std::shared_ptr<ASTNode> Parser::parseComparison() {
    auto left = parseAdditive();
    while (match(TokenType::LESS) || match(TokenType::GREATER) || 
           match(TokenType::LESS_EQUAL) || match(TokenType::GREATER_EQUAL)) {
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

std::shared_ptr<ASTNode> Parser::parseAdditive() {
    auto left = parseMultiplicative();
    while (match(TokenType::PLUS) || match(TokenType::MINUS)) {
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

std::shared_ptr<ASTNode> Parser::parseMultiplicative() {
    auto left = parseUnary();
    while (match(TokenType::STAR) || match(TokenType::SLASH) || match(TokenType::PERCENT)) {
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

std::shared_ptr<ASTNode> Parser::parseUnary() {
    if (match(TokenType::NOT) || match(TokenType::MINUS)) {
        Token op = tokens[pos - 1];
        auto operand = parseUnary();
        auto node = std::make_shared<ASTNode>();
        node->type = ASTNodeType::UNARY_OP;
        node->value = op.value;
        node->addChild(operand);
        return node;
    }
    return parsePrimary();
}

std::shared_ptr<ASTNode> Parser::parsePrimary() {
    if (match(TokenType::INT_LITERAL)) {
        auto node = std::make_shared<ASTNode>();
        node->type = ASTNodeType::LITERAL;
        node->value = tokens[pos - 1].value;
        node->inferredType = "I32";
        return node;
    } else if (match(TokenType::IDENTIFIER)) {
        auto node = std::make_shared<ASTNode>();
        node->type = ASTNodeType::IDENTIFIER;
        node->value = tokens[pos - 1].value;
        return node;
    } else if (match(TokenType::LPAREN)) {
        auto expr = parseExpression();
        consume(TokenType::RPAREN, "Expected ')'");
        return expr;
    }
    std::cerr << "Unexpected token in expression: " << peek().value << std::endl;
    exit(1);
}
