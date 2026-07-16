#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {

} Inner_ret;
typedef struct {

} Outer_ret;

int sum(void);
Inner_ret Inner(int bar);
Outer_ret Outer(int foo);

static int foo;
static int bar;
int sum(void) {
		return foo + bar;
}

Inner_ret Inner(int bar_arg) {		bar = bar_arg;

		return (Inner_ret){};
}

Outer_ret Outer(int foo_arg) {		foo = foo_arg;

		return (Outer_ret){};
}int main() {
		Outer_ret _tmp = Outer(25);
	Inner_ret _call_tmp = Inner(75);

	return sum();
}
