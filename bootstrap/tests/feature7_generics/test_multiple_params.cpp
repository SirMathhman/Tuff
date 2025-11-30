#include <iostream>
#include <cstdint>

template<typename T, typename U>
T pair(T a, U b);
int32_t test_main();
int32_t main() {
    return test_main();
}

template<typename T, typename U>
T pair(T a, U b) {
  return a;
}

int32_t test_main() {
  const int32_t x = pair<int32_t, bool>(42, true);
  return x;
}
