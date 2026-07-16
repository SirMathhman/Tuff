#include <stdio.h>
#include <string.h>
#include <stdbool.h>

typedef struct {
} Box;
typedef struct {
		const char * value;
} String;
typedef struct {
} Vec_String;
typedef struct {
		String name;
		Vec_String type_params;
		String fields_str;
} GenericStructTemplate;
typedef struct {
		String name;
		Vec_String type_params;
		Vec_String param_names;
		String body;
} GenericFunctionTemplate;
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
	
	 Counter_ret counter = Counter();
	add();
	return value;
}
