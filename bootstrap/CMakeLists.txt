cmake_minimum_required(VERSION 3.16)
project(TuffBootstrap)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ============================================================================
# Build Speed Optimizations
# ============================================================================

# Enable parallel compilation within each target (MSVC)
if(MSVC)
    add_compile_options(/MP)
endif()

# Unity builds disabled - causes issues with std::variant forward declarations
# set(CMAKE_UNITY_BUILD ON)
# set(CMAKE_UNITY_BUILD_BATCH_SIZE 8)

# Precompiled header support (CMake 3.16+)
set(PCH_HEADERS
    <string>
    <vector>
    <memory>
    <variant>
    <sstream>
    <map>
    <set>
    <iostream>
)

include_directories(src/include)

# Compiler library sources (shared between tuffc and tests)
set(COMPILER_SOURCES
    src/compiler.cpp
    src/lexer.cpp
    src/parser.cpp
    src/parser/parser_binary_ops.cpp
    src/parser/parser_unary_postfix.cpp
    src/parser/parser_primary.cpp
    src/parser/parser_match.cpp
    src/parser/parser_statements.cpp
    src/parser/parser_functions.cpp
    src/parser/parser_modules.cpp
    src/parser/parser_expect_actual.cpp
    src/parser/parser_types.cpp
    src/parser/parser_impl.cpp
    src/type_env.cpp
    src/type_checker.cpp
    src/type_checker/type_checker_binary.cpp
    src/type_checker/type_checker_access.cpp
    src/type_checker/type_checker_call.cpp
    src/type_checker/type_checker_struct.cpp
    src/type_checker/type_checker_union.cpp
    src/type_checker/type_checker_register.cpp
    src/type_checker/type_checker_register_impl.cpp
    src/type_checker/type_checker_alias.cpp
    src/type_checker/type_checker_expr.cpp
    src/type_checker/type_checker_stmt.cpp
    src/type_checker/type_checker_decl.cpp
    src/type_checker/type_checker_types.cpp
    src/codegen/codegen_cpp.cpp
    src/codegen/codegen_cpp_helpers.cpp
    src/codegen/codegen_cpp_stmt.cpp
    src/codegen/codegen_cpp_expr.cpp
    src/codegen/codegen_cpp_block.cpp
    src/codegen/codegen_cpp_forward.cpp
    src/codegen/codegen_cpp_keywords.cpp
    src/codegen/codegen_cpp_decl.cpp
    src/codegen/codegen_cpp_types.cpp
    src/codegen/codegen_cpp_union.cpp
    src/codegen/codegen_cpp_typed.cpp
    src/codegen/codegen_cpp_decl_typed.cpp
    src/codegen/codegen_cpp_deps.cpp
)

# Main compiler executable
add_executable(tuffc 
    src/main.cpp
    ${COMPILER_SOURCES}
)

# Enable precompiled headers for faster builds
target_precompile_headers(tuffc PRIVATE ${PCH_HEADERS})

# Unit test executable
add_executable(tuffc_test
    tests/unit/test_compiler.cpp
    ${COMPILER_SOURCES}
)

# Reuse PCH from tuffc to avoid rebuilding
target_precompile_headers(tuffc_test REUSE_FROM tuffc)

target_include_directories(tuffc_test PRIVATE tests/unit)
