#pragma once
#include <vector>
#include <memory>
#include "token.h"
#include "ast.h"

class Parser {
private:
    std::vector<Token> tokens;
    size_t pos = 0;

    Token peek(int offset = 0) const;
    Token advance();
    bool match(TokenType type);
    Token consume(TokenType type, const std::string& errorMsg);

    std::shared_ptr<ASTNode> parseStatement();
    std::shared_ptr<ASTNode> parseLetStatement();
    std::shared_ptr<ASTNode> parseAssignmentStatement(); // x = 10;
    std::shared_ptr<ASTNode> parseExpression();
    std::shared_ptr<ASTNode> parsePrimary();

public:
    Parser(const std::vector<Token>& toks);
    std::shared_ptr<ASTNode> parse();
};
