#ifndef INTERPRET_H
#define INTERPRET_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

/* interpret_result - result of parsing/evaluating an expression
 * Fields:
 *   ok: 1 on success, 0 on error
 *   value: valid when ok==1
 *   err: errno-style error code when ok==0 (0 if unknown)
 */
typedef struct interpret_result {
	int ok;
	int value;
	int err;
} interpret_result;

/* interpret - parse and evaluate an expression
 * Parameters:
 *   s: input null-terminated string (may be NULL)
 * Returns:
 *   interpret_result: contains success flag, value, and err code
 */
interpret_result interpret(const char *s);

#ifdef __cplusplus
}
#endif

#endif // INTERPRET_H
