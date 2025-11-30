cmake_minimum_required(VERSION 3.10)
project(TuffBootstrap)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(src/include)

add_executable(tuffc 
    src/main.cpp
    src/lexer.cpp
    src/parser.cpp
    src/type_checker.cpp
    src/codegen_js.cpp
    src/codegen_cpp.cpp
)
