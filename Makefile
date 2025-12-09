CC=clang
CFLAGS=-I./src -I./tests/vendor -Wall -Wextra -std=c99
SRCS=src/interpret.c
TEST_SRCS=tests/test_interpret.c tests/vendor/unity.c
OUT=run_tests

.PHONY: all test clean

all: test

test: $(SRCS) $(TEST_SRCS)
	$(CC) $(CFLAGS) $(SRCS) $(TEST_SRCS) -o $(OUT)
	@echo "--- Running tests ---"
	./$(OUT)

clean:
	rm -f $(OUT)
