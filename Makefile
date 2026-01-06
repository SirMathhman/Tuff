CC = gcc
CFLAGS = -Iinclude -Wall -Wextra -std=c11
SRC = src/interpret.c
TEST = tests/test_interpret.c
BIN = build/test_interpret

.PHONY: all test clean format lint

all: $(BIN)

$(BIN): $(SRC) $(TEST)
	$(CC) $(CFLAGS) -o $(BIN) $(SRC) $(TEST)

test: all
	./$(BIN)

format:
	@command -v clang-format >/dev/null 2>&1 || { echo "clang-format not found"; exit 1; }
	clang-format -i include/*.h src/*.c tests/*.c
	@echo "Formatted source files with clang-format (K&R brace style)."

lint:
	@command -v clang-tidy >/dev/null 2>&1 || { echo "clang-tidy not found"; exit 1; }
	clang-tidy $(SRC) -- -Iinclude
	@echo "Ran clang-tidy checks (see output above)."
	@echo "Running cyclomatic complexity check (threshold = 15)"
	@python scripts/check_complexity.py 15 || { echo "Complexity check failed"; exit 1; }

clean:
	rm -rf build
