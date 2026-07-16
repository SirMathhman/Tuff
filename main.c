#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {
	int value;
} Counter_ret;

void add(void);
Counter_ret Counter(void);

static int value;
void add(void) {

	value += 1;}

Counter_ret Counter(void) {

	  value = 0;
		return (Counter_ret){.value = value};
}int main() {
	
	return 1;
}
