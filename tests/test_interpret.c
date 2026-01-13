#include <assert.h>
#include "interpret.h"

int main(void)
{
	/* existing behavior: non-numeric input returns 0 */
	int r = interpret("hello");
	assert(r == 0);

	/* new behavior: numeric input should be parsed */
	assert(interpret("100") == 100);
	return 0;
}
