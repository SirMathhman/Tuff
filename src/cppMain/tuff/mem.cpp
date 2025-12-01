// C++ implementation of memory operations
#include <cstdlib>
#include <cstdint>
#include <cstddef>

extern "C"
{

	uint8_t *malloc(size_t size)
	{
		return static_cast<uint8_t *>(std::malloc(size));
	}

	uint8_t *realloc(uint8_t *ptr, size_t newSize)
	{
		return static_cast<uint8_t *>(std::realloc(ptr, newSize));
	}

	void free(uint8_t *ptr)
	{
		std::free(ptr);
	}

	void exit(int32_t code)
	{
		std::exit(code);
	}

} // extern "C"
