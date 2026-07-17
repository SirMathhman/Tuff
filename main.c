#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {
		int field;
} RawBox;

void drop(RawBox box);

static int counter;
void drop(RawBox box) {

	counter += box.field;}int main() {
	
	  counter = 0;

	 RawBox box = (RawBox){.field = 100 };

	drop(box);
	return counter;
}
