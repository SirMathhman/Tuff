#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <memory>
#include <map>

// Forward declarations
struct Token;
struct ASTNode;
class Lexer;
class Parser;
class TypeChecker;
class CodeGenerator;

// ===== Token =====
enum class TokenType {
    // Keywords
    EXPECT, ACTUAL, FN, STRUCT, ENUM, IF, ELSE, WHILE, RETURN,
    // Types
    I32, I64, F32, F64, BOOL, STRING, VOID,
    // Symbols
    LPAREN, RPAREN, LBRACE, RBRACE, LANGLE, RANGLE,
    COLON, SEMICOLON, COMMA, ARROW, FAT_ARROW,
    // Operators
    PLUS, MINUS, STAR, SLASH, EQUALS, DOUBLE_EQUALS,
    // Literals
    INT_LITERAL, FLOAT_LITERAL, STRING_LITERAL, BOOL_LITERAL,
    IDENTIFIER,
    END_OF_FILE
};

struct Token {
    TokenType type;
    std::string value;
    int line;
    int column;
};

// ===== AST Nodes =====
enum class ASTNodeType {
    PROGRAM, FUNCTION_DECL, EXPECT_DECL, ACTUAL_DECL,
    PARAM, TYPE, BLOCK, RETURN_STMT, CALL_EXPR
};

struct ASTNode {
    ASTNodeType type;
    std::string value;
    std::vector<std::shared_ptr<ASTNode>> children;
};

// ===== Lexer =====
class Lexer {
private:
    std::string source;
    size_t pos = 0;
    int line = 1;
    int column = 1;

public:
    Lexer(const std::string& src) : source(src) {}

    std::vector<Token> tokenize() {
        std::vector<Token> tokens;
        // TODO: Implement tokenization
        tokens.push_back({TokenType::END_OF_FILE, "", line, column});
        return tokens;
    }
};

// ===== Parser =====
class Parser {
private:
    std::vector<Token> tokens;
    size_t pos = 0;

public:
    Parser(const std::vector<Token>& toks) : tokens(toks) {}

    std::shared_ptr<ASTNode> parse() {
        auto program = std::make_shared<ASTNode>();
        program->type = ASTNodeType::PROGRAM;
        // TODO: Implement parsing
        return program;
    }
};

// ===== Type Checker =====
class TypeChecker {
public:
    void check(std::shared_ptr<ASTNode> ast) {
        // TODO: Implement type checking
    }
};

// ===== Code Generator =====
class CodeGenerator {
private:
    std::string target;

public:
    CodeGenerator(const std::string& tgt) : target(tgt) {}

    std::string generate(std::shared_ptr<ASTNode> ast) {
        if (target == "js") {
            return generateJS(ast);
        } else if (target == "cpp") {
            return generateCPP(ast);
        }
        return "";
    }

private:
    std::string generateJS(std::shared_ptr<ASTNode> ast) {
        // TODO: Implement JS code generation
        return "console.log('Hello, Tuff!');\n";
    }

    std::string generateCPP(std::shared_ptr<ASTNode> ast) {
        // TODO: Implement C++ code generation
        return "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, Tuff!\" << std::endl;\n    return 0;\n}\n";
    }
};

// ===== Main =====
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: tuffc <build.json>" << std::endl;
        return 1;
    }

    std::string buildFile = argv[1];
    std::cout << "Tuff Bootstrap Compiler (Stage 0 - C++)" << std::endl;
    std::cout << "Build file: " << buildFile << std::endl;

    // TODO: Parse build.json
    // TODO: Read source files
    // TODO: Compile

    // Stub: compile a simple test
    std::string sourceCode = "fn main(): Void => { print(\"Hello, Tuff!\"); }";
    
    Lexer lexer(sourceCode);
    auto tokens = lexer.tokenize();
    
    Parser parser(tokens);
    auto ast = parser.parse();
    
    TypeChecker checker;
    checker.check(ast);
    
    CodeGenerator codegen("js");
    std::string output = codegen.generate(ast);
    
    std::cout << "\n=== Generated Code (JS) ===" << std::endl;
    std::cout << output << std::endl;

    return 0;
}
