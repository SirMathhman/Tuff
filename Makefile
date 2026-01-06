CC = gcc
CFLAGS = -Iinclude -Wall -Wextra -std=c11
SRC = src/interpret.c
TEST = tests/test_interpret.c
BIN = build/test_interpret

.PHONY: all test clean

all: $(BIN)

$(BIN): $(SRC) $(TEST)
	$(CC) $(CFLAGS) -o $(BIN) $(SRC) $(TEST)

test: all
	./$(BIN)

clean:
	rm -rf build
