# SafeC Compiler Makefile

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -g
LDFLAGS =

SRC_DIR = src
TEST_DIR = tests
BUILD_DIR = build

# Source files
SRCS = $(SRC_DIR)/lexer.c $(SRC_DIR)/ast.c $(SRC_DIR)/parser.c $(SRC_DIR)/codegen.c
MAIN_SRC = $(SRC_DIR)/main.c
OBJS = $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(SRCS))
MAIN_OBJ = $(BUILD_DIR)/main.o

# Test files
TEST_LEXER = $(TEST_DIR)/test_lexer.c
TEST_PARSER = $(TEST_DIR)/test_parser.c
TEST_CODEGEN = $(TEST_DIR)/test_codegen.c

# Executables
SAFEC = $(BUILD_DIR)/safec
TEST_LEXER_EXE = $(BUILD_DIR)/test_lexer
TEST_PARSER_EXE = $(BUILD_DIR)/test_parser
TEST_CODEGEN_EXE = $(BUILD_DIR)/test_codegen

.PHONY: all clean test test-lexer test-parser test-codegen

all: $(SAFEC)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(SAFEC): $(OBJS) $(MAIN_OBJ) | $(BUILD_DIR)
	$(CC) $(LDFLAGS) $^ -o $@

# Tests
$(TEST_LEXER_EXE): $(TEST_LEXER) $(BUILD_DIR)/lexer.o | $(BUILD_DIR)
	$(CC) $(CFLAGS) $^ -o $@

$(TEST_PARSER_EXE): $(TEST_PARSER) $(BUILD_DIR)/lexer.o $(BUILD_DIR)/ast.o $(BUILD_DIR)/parser.o | $(BUILD_DIR)
	$(CC) $(CFLAGS) $^ -o $@

$(TEST_CODEGEN_EXE): $(TEST_CODEGEN) $(OBJS) | $(BUILD_DIR)
	$(CC) $(CFLAGS) $^ -o $@

test-lexer: $(TEST_LEXER_EXE)
	./$(TEST_LEXER_EXE)

test-parser: $(TEST_PARSER_EXE)
	./$(TEST_PARSER_EXE)

test-codegen: $(TEST_CODEGEN_EXE)
	./$(TEST_CODEGEN_EXE)

test: test-lexer test-parser test-codegen

clean:
	rm -rf $(BUILD_DIR)

# Example usage
example: $(SAFEC)
	@echo "=== Example: Compiling generic.safec ==="
	./$(SAFEC) examples/generic.safec -o examples/generic.c
	@echo "=== Generated C code ==="
	cat examples/generic.c
