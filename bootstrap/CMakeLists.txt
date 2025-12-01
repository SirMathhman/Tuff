cmake_minimum_required(VERSION 3.10)
project(TuffBootstrap)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(src/include)

add_executable(tuffc 
    src/main.cpp
    src/lexer.cpp
    src/parser.cpp
    src/parser_expressions.cpp
    src/parser_statements.cpp
    src/parser_modules.cpp
    src/parser_expect_actual.cpp
    src/parser_types.cpp
    src/type_checker.cpp
    src/type_checker/type_checker_binary.cpp
    src/type_checker/type_checker_access.cpp
    src/type_checker/type_checker_call.cpp
    src/type_checker/type_checker_struct.cpp
    src/type_checker/type_checker_union.cpp
    src/type_checker/type_checker_intersection.cpp
    src/type_checker/type_checker_register.cpp
    src/type_checker/type_checker_ownership.cpp
    src/type_checker/type_checker_alias.cpp
    src/type_checker/type_checker_expr.cpp
    src/type_checker/type_checker_multiple_of.cpp
    src/codegen/codegen_js.cpp
    src/codegen/codegen_js_helpers.cpp
    src/codegen/codegen_cpp.cpp
    src/codegen/codegen_cpp_header.cpp
    src/codegen/codegen_cpp_helpers.cpp
    src/codegen/codegen_cpp_decl.cpp
    src/codegen/codegen_cpp_scope.cpp
    src/codegen/codegen_cpp_types.cpp
    src/codegen/codegen_cpp_union.cpp
    src/codegen/codegen_cpp_intersection.cpp
)
