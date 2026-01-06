#include "symbols.h"
#include <ctype.h>
#include <limits.h>
#include <string.h>

/* Helper bounded copy */
static void copy_str_bounded(char *dst, const char *src, size_t dst_len) {
	size_t idx = 0;
	if (dst_len == 0) return;
	while (idx + 1 < dst_len && src[idx] != '\0') {
		dst[idx] = src[idx];
		idx++;
	}
	dst[idx] = '\0';
}

struct var_entry vars[MAX_VARS];
int vars_count = 0;

struct var_entry *find_var(const char *name) {
	for (int i = 0; i < vars_count; i++) {
		if (strcmp(vars[i].name, name) == 0) return &vars[i];
	}
	return NULL;
}

int set_var(const char *name, int value, int type) {
	struct var_entry *entry = find_var(name);
	if (entry) {
		entry->value = value;
		entry->type = type;
		return 1;
	}
	if (vars_count >= MAX_VARS) return 0;
	copy_str_bounded(vars[vars_count].name, name, MAX_VAR_NAME);
	vars[vars_count].value = value;
	vars[vars_count].type = type;
	vars_count++;
	return 1;
}
