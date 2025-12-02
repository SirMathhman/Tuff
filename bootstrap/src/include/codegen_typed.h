#pragma once

#include "ast_typed.h"
#include "ast_converter.h"
#include <sstream>

// ============================================================================
// TYPED CODE GENERATOR - Uses std::visit for pattern matching
// ============================================================================
// This demonstrates how code generation works with the new typed AST.
// Each variant is handled with explicit pattern matching via std::visit.
// ============================================================================

namespace codegen {

class TypedCodegenCPP {
public:
    std::string generate(ast::ExprPtr expr) {
        if (!expr) return "";
        return std::visit(ast::Overload{
            [this](const ast::Literal& e) { return genLiteral(e); },
            [this](const ast::Identifier& e) { return genIdentifier(e); },
            [this](const ast::BinaryOp& e) { return genBinaryOp(e); },
            [this](const ast::UnaryOp& e) { return genUnaryOp(e); },
            [this](const ast::Reference& e) { return genReference(e); },
            [this](const ast::Deref& e) { return genDeref(e); },
            [this](const ast::FieldAccess& e) { return genFieldAccess(e); },
            [this](const ast::Index& e) { return genIndex(e); },
            [this](const ast::Call& e) { return genCall(e); },
            [this](const ast::StructLiteral& e) { return genStructLiteral(e); },
            [this](const ast::ArrayLiteral& e) { return genArrayLiteral(e); },
            [this](const ast::If& e) { return genIf(e); },
            [this](const ast::Match& e) { return genMatch(e); },
            [this](const ast::Is& e) { return genIs(e); },
            [this](const ast::SizeOf& e) { return genSizeOf(e); },
            [this](const ast::Block& e) { return genBlock(e); }
        }, *expr);
    }
    
    std::string generateStmt(ast::StmtPtr stmt) {
        if (!stmt) return "";
        return std::visit(ast::Overload{
            [this](const ast::Let& s) { return genLet(s); },
            [this](const ast::Assignment& s) { return genAssignment(s); },
            [this](const ast::IfStmt& s) { return genIfStmt(s); },
            [this](const ast::While& s) { return genWhile(s); },
            [this](const ast::Loop& s) { return genLoop(s); },
            [this](const ast::Break&) -> std::string { return "break;"; },
            [this](const ast::Continue&) -> std::string { return "continue;"; },
            [this](const ast::Return& s) { return genReturn(s); },
            [this](const ast::ExprStmt& s) { return genExprStmt(s); }
        }, *stmt);
    }

private:
    // Expression generators
    std::string genLiteral(const ast::Literal& e) {
        if (e.inferredType == "Bool") {
            return e.value;
        }
        return e.value;
    }
    
    std::string genIdentifier(const ast::Identifier& e) {
        // Replace :: with ::
        std::string result = e.name;
        // Handle generic args if present
        if (!e.genericArgs.empty()) {
            result += "<";
            for (size_t i = 0; i < e.genericArgs.size(); i++) {
                if (i > 0) result += ", ";
                result += mapType(e.genericArgs[i]);
            }
            result += ">";
        }
        return result;
    }
    
    std::string genBinaryOp(const ast::BinaryOp& e) {
        return generate(e.left) + " " + e.op + " " + generate(e.right);
    }
    
    std::string genUnaryOp(const ast::UnaryOp& e) {
        return "(" + e.op + generate(e.operand) + ")";
    }
    
    std::string genReference(const ast::Reference& e) {
        return "&" + generate(e.operand);
    }
    
    std::string genDeref(const ast::Deref& e) {
        return "(*" + generate(e.operand) + ")";
    }
    
    std::string genFieldAccess(const ast::FieldAccess& e) {
        return generate(e.object) + "." + e.fieldName;
    }
    
    std::string genIndex(const ast::Index& e) {
        return generate(e.object) + "[" + generate(e.index) + "]";
    }
    
    std::string genCall(const ast::Call& e) {
        std::stringstream ss;
        ss << generate(e.callee) << "(";
        for (size_t i = 0; i < e.args.size(); i++) {
            if (i > 0) ss << ", ";
            ss << generate(e.args[i]);
        }
        ss << ")";
        return ss.str();
    }
    
    std::string genStructLiteral(const ast::StructLiteral& e) {
        std::stringstream ss;
        ss << e.typeName;
        if (!e.genericArgs.empty()) {
            ss << "<";
            for (size_t i = 0; i < e.genericArgs.size(); i++) {
                if (i > 0) ss << ", ";
                ss << mapType(e.genericArgs[i]);
            }
            ss << ">";
        }
        ss << "{";
        for (size_t i = 0; i < e.fields.size(); i++) {
            if (i > 0) ss << ", ";
            ss << generate(e.fields[i]);
        }
        ss << "}";
        return ss.str();
    }
    
    std::string genArrayLiteral(const ast::ArrayLiteral& e) {
        std::stringstream ss;
        ss << "{";
        for (size_t i = 0; i < e.elements.size(); i++) {
            if (i > 0) ss << ", ";
            ss << generate(e.elements[i]);
        }
        ss << "}";
        return ss.str();
    }
    
    std::string genIf(const ast::If& e) {
        std::stringstream ss;
        ss << "(" << generate(e.condition) << " ? ";
        ss << generate(e.thenBranch) << " : ";
        ss << generate(e.elseBranch) << ")";
        return ss.str();
    }
    
    std::string genMatch(const ast::Match& e) {
        // Simplified match - would need full implementation
        std::stringstream ss;
        ss << "/* match */ (";
        for (size_t i = 0; i < e.arms.size(); i++) {
            if (i > 0) ss << " : ";
            ss << generate(e.arms[i].body);
        }
        ss << ")";
        return ss.str();
    }
    
    std::string genIs(const ast::Is& e) {
        return generate(e.value) + ".__tag == /* " + e.targetTypeStr + " */";
    }
    
    std::string genSizeOf(const ast::SizeOf& e) {
        return "sizeof(" + mapType(e.typeStr) + ")";
    }
    
    std::string genBlock(const ast::Block& e) {
        std::stringstream ss;
        ss << "{\n";
        for (auto& stmt : e.statements) {
            ss << "    " << generateStmt(stmt) << "\n";
        }
        if (e.resultExpr) {
            ss << "    return " << generate(e.resultExpr) << ";\n";
        }
        ss << "}";
        return ss.str();
    }
    
    // Statement generators
    std::string genLet(const ast::Let& s) {
        std::stringstream ss;
        ss << "auto ";
        if (!s.isMutable) ss << "const ";
        ss << s.name;
        if (s.initializer) {
            ss << " = " << generate(s.initializer);
        }
        ss << ";";
        return ss.str();
    }
    
    std::string genAssignment(const ast::Assignment& s) {
        return generate(s.target) + " = " + generate(s.value) + ";";
    }
    
    std::string genIfStmt(const ast::IfStmt& s) {
        std::stringstream ss;
        ss << "if (" << generate(s.condition) << ") ";
        ss << generate(s.thenBranch);
        if (s.elseBranch) {
            ss << " else " << generate(s.elseBranch);
        }
        return ss.str();
    }
    
    std::string genWhile(const ast::While& s) {
        return "while (" + generate(s.condition) + ") " + generate(s.body);
    }
    
    std::string genLoop(const ast::Loop& s) {
        return "while (true) " + generate(s.body);
    }
    
    std::string genReturn(const ast::Return& s) {
        if (s.value) {
            return "return " + generate(s.value) + ";";
        }
        return "return;";
    }
    
    std::string genExprStmt(const ast::ExprStmt& s) {
        return generate(s.expr) + ";";
    }
    
    // Type mapping (simplified)
    std::string mapType(const std::string& type) {
        if (type == "I32") return "int32_t";
        if (type == "I64") return "int64_t";
        if (type == "U32") return "uint32_t";
        if (type == "U64") return "uint64_t";
        if (type == "U8") return "uint8_t";
        if (type == "Bool") return "bool";
        if (type == "Void") return "void";
        if (type == "USize") return "size_t";
        return type;
    }
};

} // namespace codegen
