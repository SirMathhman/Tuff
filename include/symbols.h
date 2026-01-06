#ifndef TUFF_SYMBOLS_H
#define TUFF_SYMBOLS_H

#include <stddef.h>

#define MAX_VARS 64
#define MAX_VAR_NAME 32

enum var_type { VT_I32 = 0, VT_BOOL = 1 };

struct var_entry {
	char name[MAX_VAR_NAME];
	int value;
	int type; /* enum var_type */
};

extern struct var_entry vars[MAX_VARS];
extern int vars_count;

int set_var(const char *name, int value, int type);
struct var_entry *find_var(const char *name);

#endif /* TUFF_SYMBOLS_H */
