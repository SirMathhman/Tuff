#include <iostream>
#include <cstdint>

int32_t main() {
    const int32_t a = 10;
    const int32_t b = 3;
    const int32_t add = (a + b);
    const int32_t sub = (a - b);
    const int32_t mul = (a * b);
    const int32_t div = (a / b);
    const int32_t mod = (a % b);
    const bool eq = (a == b);
    const bool neq = (a != b);
    const bool lt = (a < b);
    const bool gt = (a > b);
    const bool lte = (a <= b);
    const bool gte = (a >= b);
    const bool t = true;
    const bool f = false;
    const bool and = (t && f);
    const bool or = (t || f);
    const bool not = (!t);
    return mul;
}
