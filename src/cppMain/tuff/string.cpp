// C++ implementation of Tuff string operations
#include <string>
#include <cstdint>
#include <cstddef>

// String operations implementation
size_t string_length(const std::string &s)
{
	return s.length();
}

uint8_t string_charAt(const std::string &s, size_t index)
{
	return static_cast<uint8_t>(s[index]);
}

std::string string_substring(const std::string &s, size_t start, size_t end)
{
	return s.substr(start, end - start);
}

int32_t string_indexOf(const std::string &s, const std::string &needle)
{
	size_t pos = s.find(needle);
	return pos == std::string::npos ? -1 : static_cast<int32_t>(pos);
}

bool string_equals(const std::string &s1, const std::string &s2)
{
	return s1 == s2;
}

std::string string_concat(const std::string &s1, const std::string &s2)
{
	return s1 + s2;
}

std::string string_fromI32(int32_t value)
{
	return std::to_string(value);
}

int32_t string_toI32(const std::string &s)
{
	return std::stoi(s);
}

void string_destroy(const std::string &s)
{
	// std::string has RAII, destructor is called automatically
	// This function exists for consistency with the Tuff ownership model
}
