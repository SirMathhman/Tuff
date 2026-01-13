CC = clang
CFLAGS = -Wall -Wextra -std=c11 -I./src
SRC = src/interpret.c
TEST = tests/test_interpret.c

# Max seconds allowed for the test binary to run before being killed.
# Override like: make test TEST_TIMEOUT_SECS=5
TEST_TIMEOUT_SECS ?= 10

all: test

lint:
	clang-tidy $(SRC) -- $(CFLAGS)

test: $(SRC) $(TEST)
	$(CC) $(CFLAGS) $(SRC) $(TEST) -o test_interpret
	@powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_tests.ps1 -TimeoutSeconds $(TEST_TIMEOUT_SECS)

clean:
	rm -f test_interpret
