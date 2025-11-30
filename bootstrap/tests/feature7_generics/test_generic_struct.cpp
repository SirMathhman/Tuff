#include <iostream>
#include <cstdint>

template<typename T>
struct Box {
    T value;
};
int32_t test_main();
int32_t main() {
    return test_main();
}

int32_t test_main() {
  const Box<int32_t> b1 = Box<int32_t>{ 10 };
  const Box<bool> b2 = Box<bool>{ true };
  if (b2.value) {
  return b1.value;
} else {
  return 0;
};
}
