#ifndef TUFF_ARGV_BUILTINS_H
#define TUFF_ARGV_BUILTINS_H

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <cstdlib>

// ArgvArray is a pointer to an array of strings (char**)
typedef char **ArgvArray;

// Convert command-line arguments to Tuff argv format
inline ArgvArray __builtin_argv_convert(int argc, char **argv)
{
	// Allocate array of pointers
	char **result = static_cast<char **>(std::malloc(sizeof(char *) * argc));

	if (result != nullptr)
	{
		for (int i = 0; i < argc; i++)
		{
			size_t len = std::strlen(argv[i]);
			result[i] = static_cast<char *>(std::malloc(len + 1));
			if (result[i] != nullptr)
			{
				std::memcpy(result[i], argv[i], len + 1);
			}
		}
	}

	return result;
}

// Free argv array
inline void __builtin_argv_free(ArgvArray argv, size_t count)
{
	if (argv != nullptr)
	{
		for (size_t i = 0; i < count; i++)
		{
			std::free(argv[i]);
		}
		std::free(argv);
	}
}

#endif // TUFF_ARGV_BUILTINS_H
