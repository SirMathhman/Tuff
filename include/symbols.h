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
	int is_mut; /* 1 if mutable */
};

extern struct var_entry vars[MAX_VARS];
extern int vars_count;

int set_var(const char *name, const struct var_entry *attrs);
struct var_entry *find_var(const char *name);

#endif /* TUFF_SYMBOLS_H */
