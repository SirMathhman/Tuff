cmake_minimum_required(VERSION 3.16)
project(TuffGenerated)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCES
    test_simple.cpp
)

# Main wrapper to call tuff_main
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/main_wrapper.cpp"
"int32_t tuff_main();\nint main() { return tuff_main(); }\n")

add_executable(tuff_program ${SOURCES} "${CMAKE_CURRENT_BINARY_DIR}/main_wrapper.cpp")
