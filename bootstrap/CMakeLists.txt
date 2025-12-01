cmake_minimum_required(VERSION 3.10)
project(TuffBootstrap)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(src/include)

add_executable(tuffc 
    src/main.cpp
    src/lexer.cpp
    src/parser.cpp
    src/parser_statements.cpp
    src/parser_modules.cpp
    src/parser_expect_actual.cpp
    src/parser_types.cpp
    src/type_checker.cpp
    src/type_checker_helpers.cpp
    src/type_checker_union.cpp
    src/type_checker_register.cpp
    src/type_checker_ownership.cpp
    src/codegen/codegen_js.cpp
    src/codegen/codegen_js_helpers.cpp
    src/codegen/codegen_cpp.cpp
    src/codegen/codegen_cpp_helpers.cpp
    src/codegen/codegen_cpp_types.cpp
    src/codegen/codegen_cpp_union.cpp
)
