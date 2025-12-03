#include <iostream>
#include <cstdint>

template<typename T>
T identity(T x);
int32_t test_main();
int32_t main() {
    return test_main();
}

template<typename T>
T identity(T x) {
  return x;
}

int32_t test_main() {
  const int32_t a = identity<int32_t>(10);
  const bool b = identity<bool>(true);
  if (b) {
  return a;
} else {
  return 0;
};
}
