#include <stdlib.h>






int main() {
	
	 const char * * ptr = malloc(sizeof(const char *));

	ptr[0] = "foo";
	return 0;
}
