# Use clang as the compiler (clang only)
CC := clang

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
	clang-format -i include/*.h src/*.c tests/*.c
	@echo "Formatted source files with clang-format (K&R brace style)."

precommit: test lint format
	@echo "precommit: all checks passed"

lint:
	clang-tidy $(SRC) -- -Iinclude
	@echo "Ran clang-tidy checks (see output above)."
	@echo "Running cyclomatic complexity check (threshold = 15)"
	python scripts/check_complexity.py 15
	@echo "Checking include placement (includes must be at top)"
	python scripts/check_include_placement.py
	@echo "Checking max parameter count (max = 3)"
	python scripts/check_param_count.py 3
	@echo "Running PMD CPD (minimum tokens = 50) on src and tests (C/C++)"
	@powershell -NoProfile -Command "try { pmd --version > $null } catch { Write-Error 'pmd not found in PATH; install PMD and ensure pmd is available'; exit 1 }"
	@powershell -NoProfile -Command "pmd cpd --minimum-tokens 50 --ignore-identifiers --ignore-literals --dir 'src,tests' -l cpp -f text"
	@echo "PMD CPD completed"
