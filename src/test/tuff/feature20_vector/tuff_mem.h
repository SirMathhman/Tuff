#include <cstdlib>
#include <cstring>

template <typename T>
T *tuff_malloc(size_t size)
{
	return (T *)malloc(size);
}

template <typename T>
T *tuff_realloc(T *ptr, size_t newSize)
{
	return (T *)realloc(ptr, newSize);
}

template <typename T>
void tuff_free(T *ptr)
{
	free(ptr);
}
