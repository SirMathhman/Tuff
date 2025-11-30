#pragma once
#include <memory>
#include <map>
#include <string>
#include "ast.h"

struct SymbolInfo {
    std::string type;
    bool isMutable;
};

class TypeChecker {
private:
    std::map<std::string, SymbolInfo> symbolTable;

public:
    void check(std::shared_ptr<ASTNode> node);
};
