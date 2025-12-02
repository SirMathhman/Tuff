#ifndef TUFF_STRING_BUILTINS_H
#define TUFF_STRING_BUILTINS_H

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#include <limits>

// String type in Tuff: string = const char*

// Get string length (excluding null terminator)
inline size_t string_length(const char *s)
{
	return std::strlen(s);
}

// Get character at index (no bounds checking)
inline uint8_t string_charAt(const char *s, size_t index)
{
	return static_cast<uint8_t>(s[index]);
}

// Concatenate two strings (returns newly allocated string)
inline char *string_concat(const char *s1, const char *s2)
{
	size_t len1 = std::strlen(s1);
	size_t len2 = std::strlen(s2);
	char *result = static_cast<char *>(std::malloc(len1 + len2 + 1));

	if (result != nullptr)
	{
		std::memcpy(result, s1, len1);
		std::memcpy(result + len1, s2, len2);
		result[len1 + len2] = '\0';
	}

	return result;
}

// Compare two strings for equality
inline bool string_equals(const char *s1, const char *s2)
{
	return std::strcmp(s1, s2) == 0;
}

// Extract substring [start, end) (returns newly allocated string)
inline char *string_substring(const char *s, size_t start, size_t end)
{
	if (end <= start)
	{
		char *empty = static_cast<char *>(std::malloc(1));
		if (empty != nullptr)
		{
			empty[0] = '\0';
		}
		return empty;
	}

	size_t len = end - start;
	char *result = static_cast<char *>(std::malloc(len + 1));

	if (result != nullptr)
	{
		std::memcpy(result, s + start, len);
		result[len] = '\0';
	}

	return result;
}

// Find first occurrence of needle in haystack (returns -1 if not found)
inline int32_t string_indexOf(const char *haystack, const char *needle)
{
	const char *result = std::strstr(haystack, needle);

	if (result == nullptr)
	{
		return -1;
	}

	return static_cast<int32_t>(result - haystack);
}

// Convert integer to string (returns newly allocated string)
inline char *string_fromI32(int32_t value)
{
	// Max length for int32_t: "-2147483648" = 11 chars + null terminator
	char *result = static_cast<char *>(std::malloc(12));

	if (result != nullptr)
	{
		std::snprintf(result, 12, "%d", value);
	}

	return result;
}

// Parse string to integer (returns Option<I32>)
// Option<I32> in Tuff is: Some<I32> { value: I32 } | None<I32> { }
// We use a struct with tag field (0 = None, 1 = Some) and value field
struct OptionI32
{
	uint8_t tag; // 0 = None, 1 = Some
	int32_t value;
};

inline OptionI32 string_toI32(const char *s)
{
	char *endptr;
	errno = 0;
	long val = std::strtol(s, &endptr, 10);

	// Check for errors: no conversion, trailing characters, or out of range
	if (endptr == s || *endptr != '\0' ||
			errno == ERANGE || val < INT32_MIN || val > INT32_MAX)
	{
		return OptionI32{0, 0}; // None
	}

	return OptionI32{1, static_cast<int32_t>(val)}; // Some(value)
}

// Create a string from a byte buffer (copies the data)
inline char *string_fromBytes(const uint8_t *buffer, size_t length)
{
	char *result = static_cast<char *>(std::malloc(length + 1));
	if (result != nullptr)
	{
		std::memcpy(result, buffer, length);
		result[length] = '\0';
	}
	return result;
}

#endif // TUFF_STRING_BUILTINS_H
