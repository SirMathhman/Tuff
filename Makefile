CC = clang
CFLAGS = -Wall -Wextra

all: test

test: main_test.c main.c
	$(CC) $(CFLAGS) -o test_run main_test.c main.c
	./test_run

clean:
	rm -f test_run

.PHONY: all test clean