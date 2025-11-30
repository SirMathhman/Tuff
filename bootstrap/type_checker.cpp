#include "type_checker.h"
#include <iostream>

void TypeChecker::check(std::shared_ptr<ASTNode> node) {
    switch (node->type) {
        case ASTNodeType::PROGRAM:
            for (auto child : node->children) {
                check(child);
            }
            break;

        case ASTNodeType::LET_STMT: {
            std::string name = node->value;
            if (symbolTable.find(name) != symbolTable.end()) {
                std::cerr << "Error: Variable '" << name << "' already declared (no shadowing allowed)." << std::endl;
                exit(1);
            }

            auto init = node->children[0];
            check(init);

            std::string type = node->inferredType;
            if (type == "Inferred") {
                type = init->inferredType;
                node->inferredType = type; // Update AST with inferred type
            } else {
                if (type != init->inferredType) {
                    std::cerr << "Error: Type mismatch for '" << name << "'. Expected " << type << ", got " << init->inferredType << std::endl;
                    exit(1);
                }
            }

            symbolTable[name] = {type, node->isMutable};
            break;
        }

        case ASTNodeType::ASSIGNMENT_STMT: {
            std::string name = node->value;
            auto it = symbolTable.find(name);
            if (it == symbolTable.end()) {
                std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
                exit(1);
            }

            if (!it->second.isMutable) {
                std::cerr << "Error: Cannot assign to immutable variable '" << name << "'." << std::endl;
                exit(1);
            }

            auto value = node->children[0];
            check(value);

            if (it->second.type != value->inferredType) {
                std::cerr << "Error: Type mismatch in assignment to '" << name << "'. Expected " << it->second.type << ", got " << value->inferredType << std::endl;
                exit(1);
            }
            break;
        }

        case ASTNodeType::IDENTIFIER: {
            std::string name = node->value;
            auto it = symbolTable.find(name);
            if (it == symbolTable.end()) {
                std::cerr << "Error: Variable '" << name << "' not declared." << std::endl;
                exit(1);
            }
            node->inferredType = it->second.type;
            break;
        }

        case ASTNodeType::LITERAL:
            // Type already set by parser (e.g., I32)
            break;

        default:
            break;
    }
}
