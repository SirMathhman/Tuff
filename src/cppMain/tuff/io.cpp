// io.cpp - C++ implementation
// Maps to extern functions in io.tuff

#include <iostream>
#include <cstdint>

extern "C" {

void print(const char *message)
{
	std::cout << message << std::flush;
}

void println(const char *message)
{
	std::cout << message << std::endl;
}

}  // extern "C"
