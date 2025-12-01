#include "compiler.h"
#include "lexer.h"
#include "parser.h"
#include "type_checker.h"
#include "codegen_js.h"
#include "codegen_cpp.h"

#include <sstream>
#include <iostream>

std::string compile(const std::string& source, const std::string& target) {
    // Capture stderr to detect compilation errors
    std::stringstream errorBuffer;
    std::streambuf* oldCerr = std::cerr.rdbuf(errorBuffer.rdbuf());
    
    try {
        // 1. Lexing
        Lexer lexer(source);
        auto tokens = lexer.tokenize();
        
        // 2. Parsing
        Parser parser(tokens);
        auto ast = parser.parse();
        
        // 3. Type Checking
        TypeChecker checker;
        checker.check(ast);
        
        // Check if any errors were written to stderr
        std::string errors = errorBuffer.str();
        if (!errors.empty()) {
            std::cerr.rdbuf(oldCerr);
            throw CompileError(errors);
        }
        
        // 4. Code Generation
        std::string output;
        if (target == "js") {
            CodeGeneratorJS codegen;
            output = codegen.generate(ast);
        } else if (target == "cpp") {
            CodeGeneratorCPP codegen;
            output = codegen.generate(ast);
        } else {
            std::cerr.rdbuf(oldCerr);
            throw CompileError("Unknown target: " + target);
        }
        
        // Restore stderr
        std::cerr.rdbuf(oldCerr);
        return output;
        
    } catch (const CompileError&) {
        std::cerr.rdbuf(oldCerr);
        throw;
    } catch (const std::exception& e) {
        std::cerr.rdbuf(oldCerr);
        std::string errors = errorBuffer.str();
        if (!errors.empty()) {
            throw CompileError(errors);
        }
        throw CompileError(e.what());
    }
}
