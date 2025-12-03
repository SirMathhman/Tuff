#ifndef TUFF_IO_BUILTINS_H
#define TUFF_IO_BUILTINS_H

#include <iostream>
#include <cstring>

// Print a string to stdout (without newline)
inline void __builtin_io_print(const char *s)
{
	std::cout << s;
}

// Print a string to stdout with newline
inline void __builtin_io_println(const char *s)
{
	std::cout << s << std::endl;
}

// Convenience aliases (without __ prefix)
inline void print(const char *s) { __builtin_io_print(s); }
inline void println(const char *s) { __builtin_io_println(s); }

#endif // TUFF_IO_BUILTINS_H
