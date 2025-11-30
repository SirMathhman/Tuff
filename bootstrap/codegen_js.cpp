#include "codegen_js.h"
#include <sstream>

std::string CodeGeneratorJS::generate(std::shared_ptr<ASTNode> ast) {
    std::stringstream ss;
    // For Node.js, we can just emit statements.
    // If the last node is an expression, we wrap it in process.exit()
    
    for (size_t i = 0; i < ast->children.size(); ++i) {
        auto child = ast->children[i];
        if (i == ast->children.size() - 1 && (child->type == ASTNodeType::LITERAL || child->type == ASTNodeType::IDENTIFIER)) {
            ss << "process.exit(" << generateNode(child) << ");\n";
        } else {
            ss << generateNode(child) << ";\n";
        }
    }
    return ss.str();
}

std::string CodeGeneratorJS::generateNode(std::shared_ptr<ASTNode> node) {
    switch (node->type) {
        case ASTNodeType::LET_STMT: {
            std::string keyword = node->isMutable ? "let" : "const";
            return keyword + " " + node->value + " = " + generateNode(node->children[0]);
        }
        case ASTNodeType::ASSIGNMENT_STMT:
            return node->value + " = " + generateNode(node->children[0]);
        case ASTNodeType::LITERAL:
        case ASTNodeType::IDENTIFIER:
            return node->value;
        default:
            return "";
    }
}
