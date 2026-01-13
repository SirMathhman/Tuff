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
	/* U8 suffix limits range to 0-255 */
	assert(interpret("256U8") == INT_MIN);

	/* Unsigned suffixes */
	assert(interpret("65535U16") == (65535 > INT_MAX ? INT_MAX : 65535));
	assert(interpret("65536U16") == INT_MIN);
	assert(interpret("4294967295U32") == INT_MAX); /* Clamped to INT_MAX since return is int */
	assert(interpret("-1U32") == INT_MIN);

	/* Signed suffixes */
	assert(interpret("127I8") == 127);
	assert(interpret("128I8") == INT_MIN);
	assert(interpret("-128I8") == -128);
	assert(interpret("-129I8") == INT_MIN);

	assert(interpret("32767I16") == 32767);
	assert(interpret("32768I16") == INT_MIN);

	return 0;
}
