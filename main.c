#include <stdio.h>
#include <string.h>
#include <stdbool.h>



int pass(void);
const char * pass_Str(const char * value);


const char * pass_Str(const char * value) {
		return value;
}int main() {
	
	return (int)strlen(pass_Str("foo"));
}
