cmake_minimum_required(VERSION 3.10)
project(Tuff C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Library
add_library(tuff_lib
    src/greet.c
)

# Main executable
add_executable(tuff
    src/main.c
)
target_link_libraries(tuff PRIVATE tuff_lib)

# Tests
enable_testing()

add_executable(test_greet
    tests/test_greet.c
)
target_link_libraries(test_greet PRIVATE tuff_lib)

add_test(NAME greet COMMAND test_greet)