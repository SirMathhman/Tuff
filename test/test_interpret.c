#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include "../include/interpret.h"
#include "../include/arena.h"

int main(void)
{
	arena_init(1024);

	struct
	{
		const char *in;
		const char *want;
	} cases[] = {
			{"1 + 2", "3"},
			{"1 + 2 + 3", "6"},
			{"1 + 2 - 3", "0"},
			{"1 + {2} - 3", "0"},
			{"1 + {let x = 2; x} - 3", "0"},
			{"1 + {let mut x = 0; x = 2; x} - 3", "0"},
			{" 10 + 20 * 3 ", "70"},
			{"(2+3)*4", "20"},
			{"7 - 5 / 2", "5"},
			{"-3 + 5", "2"},
	};

	for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i)
	{
		char *out = interpret(cases[i].in);
		if (!out)
		{
			arena_cleanup();
			return 2;
		}
		if (strcmp(out, cases[i].want) != 0) {
			fprintf(stderr, "Test %zu failed: in='%s' out='%s' want='%s'\n", i, cases[i].in, out, cases[i].want);
			arena_free(out, strlen(out) + 1);
			arena_cleanup();
			return 3;
		}
		printf("case %zu: '%s' => %s\n", i, cases[i].in, out);
		arena_free(out, strlen(out) + 1);
	}

	arena_cleanup();
	return 0;
}
