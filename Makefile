CC = clang
CFLAGS = -Wall -Wextra -std=c11 -I./src
SRC = src/interpret.c
TEST = tests/test_interpret.c

all: test

lint:
	clang-tidy $(SRC) -- $(CFLAGS)

test: $(SRC) $(TEST)
	$(CC) $(CFLAGS) $(SRC) $(TEST) -o test_interpret
	./test_interpret

clean:
	rm -f test_interpret
