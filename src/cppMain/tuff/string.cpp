// C++ implementation of Tuff string operations
#include <string>
#include <cstdint>
#include <cstddef>
#include <cstring>

extern "C" {

// String operations implementation using C-style strings (char*)
size_t string_length(const char *s)
{
	return std::strlen(s);
}

uint8_t string_charAt(const char *s, size_t index)
{
	return static_cast<uint8_t>(s[index]);
}

char *string_substring(const char *s, size_t start, size_t end)
{
	size_t len = end - start;
	char *result = new char[len + 1];
	std::strncpy(result, s + start, len);
	result[len] = '\0';
	return result;
}

int32_t string_indexOf(const char *s, const char *needle)
{
	const char *pos = std::strstr(s, needle);
	return pos == nullptr ? -1 : static_cast<int32_t>(pos - s);
}

bool string_equals(const char *s1, const char *s2)
{
	return std::strcmp(s1, s2) == 0;
}

char *string_concat(const char *s1, const char *s2)
{
	size_t len1 = std::strlen(s1);
	size_t len2 = std::strlen(s2);
	char *result = new char[len1 + len2 + 1];
	std::strcpy(result, s1);
	std::strcat(result, s2);
	return result;
}

char *string_fromI32(int32_t value)
{
	std::string temp = std::to_string(value);
	char *result = new char[temp.length() + 1];
	std::strcpy(result, temp.c_str());
	return result;
}

int32_t string_toI32(const char *s)
{
	return std::stoi(s);
}

void string_destroy(char *s)
{
	delete[] s;
}

}  // extern "C"
