#ifndef TUFF_IO_BUILTINS_H
#define TUFF_IO_BUILTINS_H

#include <iostream>
#include <string>

inline void print(const char *message)
{
	std::cout << message;
}

inline void println(const char *message)
{
	std::cout << message << std::endl;
}

#endif // TUFF_IO_BUILTINS_H
