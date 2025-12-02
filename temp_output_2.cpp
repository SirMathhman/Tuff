#include <iostream>
#include <cstdint>
#include <cstddef>
#include <string>

template<typename T>
struct Some {
    T value;
};
template<typename T>
struct None {
};
template<typename T>
struct Vector {
    T* data;
    size_t length;
    size_t capacity;
};
// Union type: Some<T>|None<T>
template<typename T>
struct Union_Some_None {
    enum class Tag { Some, None };

    Tag __tag;
    union {
        Some<T> __val_Some;
        None<T> __val_None;
    };

    Union_Some_None(Some<T> val) : __tag(Tag::Some), __val_Some(val) {}
    Union_Some_None(None<T> val) : __tag(Tag::None), __val_None(val) {}
};

template<typename T>
Vector<T> vectorNew();
template<typename T>
size_t vectorLen(const Vector<T>* vec);
template<typename T>
size_t vectorCapacity(const Vector<T>* vec);
template<typename T>
bool vectorIsEmpty(const Vector<T>* vec);
template<typename T>
void vectorPush(Vector<T>* vec, T value);
template<typename T>
Union_Some_None<T> vectorGet(const Vector<T>* vec, size_t index);
template<typename T>
void vectorFree(Vector<T>* vec);
int main() {
    Vector<int32_t> vec = vectorNew<int32_t>();
    if (vectorLen<int32_t>(&vec) != 0) {
  exit(1);
};
    if ((!vectorIsEmpty<int32_t>(&vec))) {
  exit(2);
};
    if (vectorCapacity<int32_t>(&vec) != 10) {
  exit(3);
};
    vectorPush<int32_t>(&vec, 42);
    vectorPush<int32_t>(&vec, 100);
    vectorPush<int32_t>(&vec, 200);
    if (vectorLen<int32_t>(&vec) != 3) {
  exit(4);
};
    if (vectorIsEmpty<int32_t>(&vec)) {
  exit(5);
};
    const Union_Some_None<int32_t> first = vectorGet<int32_t>(&vec, 0);
    if ((first.__tag == Union_Some_None<int32_t>::Tag::None)) {
  exit(6);
};
    const Some<int32_t> firstSome = first;
    if (firstSome.value != 42) {
  exit(7);
};
    const Union_Some_None<int32_t> second = vectorGet<int32_t>(&vec, 1);
    if ((second.__tag == Union_Some_None<int32_t>::Tag::None)) {
  exit(8);
};
    const Some<int32_t> secondSome = second;
    if (secondSome.value != 100) {
  exit(9);
};
    const Union_Some_None<int32_t> third = vectorGet<int32_t>(&vec, 2);
    if ((third.__tag == Union_Some_None<int32_t>::Tag::None)) {
  exit(10);
};
    const Some<int32_t> thirdSome = third;
    if (thirdSome.value != 200) {
  exit(11);
};
    const Union_Some_None<int32_t> invalid = vectorGet<int32_t>(&vec, 3);
    if ((invalid.__tag == Union_Some_None<int32_t>::Tag::Some)) {
  exit(12);
};
    vectorFree<int32_t>(&vec);
    return 0;
}

template<typename T>
Vector<T> vectorNew() {
  void* const voidPtr = malloc(sizeof(T) * 10);
  T* const data = tuff_malloc<T>(sizeof(T) * 10);
  return Vector<T>{ data, 0, 10 };
}

template<typename T>
size_t vectorLen(const Vector<T>* vec) {
  return vec->length;
}

template<typename T>
size_t vectorCapacity(const Vector<T>* vec) {
  return vec->capacity;
}

template<typename T>
bool vectorIsEmpty(const Vector<T>* vec) {
  return vec->length == 0;
}

template<typename T>
void vectorPush(Vector<T>* vec, T value) {
  if (vec->length >= vec->capacity) {
  const size_t newCapacity = vec->capacity * 2;
  vec->data = tuff_realloc<T>(vec->data, sizeof(T) * newCapacity);
  vec->capacity = newCapacity;
};
  vec->data[vec->length] = value;
  vec->length = vec->length + 1;
}

template<typename T>
Union_Some_None<T> vectorGet(const Vector<T>* vec, size_t index) {
  if (index >= vec->length) {
  const None<T> none = None<T>{  };
  return none;
};
  const T* const ptr = vec->data + index;
  const Some<T> some = Some<T>{ *ptr };
  return some;
}

template<typename T>
void vectorFree(Vector<T>* vec) {
  tuff_free<T>(vec->data);
}
