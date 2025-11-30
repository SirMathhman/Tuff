#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "lexer.h"
#include "parser.h"
#include "type_checker.h"
#include "codegen_js.h"
#include "codegen_cpp.h"

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "Could not open file: " << path << std::endl;
        exit(1);
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Usage: tuffc <source.tuff> <target>" << std::endl;
        std::cerr << "Targets: js, cpp" << std::endl;
        return 1;
    }

    std::string sourcePath = argv[1];
    std::string target = argv[2];
    
    std::string sourceCode = readFile(sourcePath);

    // 1. Lexing
    Lexer lexer(sourceCode);
    auto tokens = lexer.tokenize();

    // 2. Parsing
    Parser parser(tokens);
    auto ast = parser.parse();

    // 3. Type Checking
    TypeChecker checker;
    checker.check(ast);

    // 4. Code Generation
    std::string output;
    if (target == "js") {
        CodeGeneratorJS codegen;
        output = codegen.generate(ast);
    } else if (target == "cpp") {
        CodeGeneratorCPP codegen;
        output = codegen.generate(ast);
    } else {
        std::cerr << "Unknown target: " << target << std::endl;
        return 1;
    }

    std::cout << output;

    return 0;
}
