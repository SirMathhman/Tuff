#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include "../include/interpret.h"

int main(void)
{
	struct
	{
		const char *in;
		const char *want;
	} cases[] = {
			{"1 + 2", "3"},
			{" 10 + 20 * 3 ", "70"},
			{"(2+3)*4", "20"},
			{"7 - 5 / 2", "5"},
			{"-3 + 5", "2"},
	};

	for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i)
	{
		char *out = interpret(cases[i].in);
		if (!out)
			return 2;
		assert(strcmp(out, cases[i].want) == 0);
		puts(out);
		free(out);
	}
	return 0;
}
