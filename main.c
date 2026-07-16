#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {
	int value;
} Counter_ret;

void add(Counter_ret* instance);
Counter_ret Counter(void);


void add(Counter_ret* instance) {

	instance->value += 1;}

Counter_ret Counter(void) {

	 int value = 0;
		return (Counter_ret){.value = value};
}int main() {
	
	 Counter_ret first = Counter();
	add(&first);
	add(&first);

	 Counter_ret second = Counter();
	add(&second);
	return first.value;
}
