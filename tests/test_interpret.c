#include <assert.h>
#include <limits.h>
#include "interpret.h"

int main(void)
{
	/* existing behavior: non-numeric input returns 0 */
	int r = interpret("hello");
	assert(r == 0);

	/* new behavior: numeric input should be parsed */
	assert(interpret("100") == 100);
	/* accept numeric suffixes like U8 */
	assert(interpret("100U8") == 100);
	/* negative numbers indicate lower-bound error */
	assert(interpret("-100U8") == INT_MIN);
	return 0;
}
