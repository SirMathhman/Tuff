#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct
{
	int value;
} a_ret;

int b(a_ret *instance);
a_ret a(void);

int b(a_ret *instance)
{
	return instance->value;
}

a_ret a(void)
{

	int value = 100;
	return (a_ret){.value = value};
}
int main()
{
	a_ret _tmp = a();

	return b(&_tmp);
}
