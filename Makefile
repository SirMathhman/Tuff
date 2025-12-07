CC=gcc
CFLAGS=-Iinclude -Wall -Wextra -std=c11

all: test

test: src/interpret.c test/test_interpret.c
	$(CC) $(CFLAGS) -o test/interpret_test src/interpret.c test/test_interpret.c

clean:
	rm -f test/interpret_test
