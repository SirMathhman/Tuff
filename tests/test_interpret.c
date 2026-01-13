#include <assert.h>
#include "interpret.h"

int main(void) {
    int r = interpret("hello");
    // Currently the stub returns 0; assert that behavior so tests are explicit
    assert(r == 0);
    return 0;
}
