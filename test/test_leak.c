#include <stdio.h>
#include "../include/interpret.h"
#include "../include/arena.h"

int main(void)
{
	arena_init(1024);

	/* Allocate but don't free - should trigger leak detection */
	char *out = interpret("1 + 2");
	if (!out)
	{
		fprintf(stderr, "interpret failed\n");
		arena_cleanup();
		return 2;
	}

	printf("Result: %s (but not freeing it)\n", out);

	/* This should abort with leak detection error */
	arena_cleanup();

	return 0;
}
