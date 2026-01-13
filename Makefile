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
	@$(MAKE) --no-print-directory run_test_with_timeout

.PHONY: run_test_with_timeout
run_test_with_timeout:
ifeq ($(OS),Windows_NT)
	@powershell -NoProfile -Command "$$p=Start-Process -FilePath '.\\test_interpret' -NoNewWindow -PassThru; try { Wait-Process -Id $$p.Id -Timeout $(TEST_TIMEOUT_SECS) -ErrorAction Stop } catch [System.TimeoutException] { try { Stop-Process -Id $$p.Id -Force -ErrorAction SilentlyContinue } catch {} ; exit 124 }; exit $$p.ExitCode"
else
	@timeout $(TEST_TIMEOUT_SECS)s ./test_interpret
endif

clean:
	rm -f test_interpret
