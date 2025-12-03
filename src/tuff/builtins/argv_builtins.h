// Argv builtins for Tuff
// Handles conversion of C argc/argv to Tuff slice

#pragma once

#include <cstdlib>
#include <cstring>

// Simple struct to match Tuff's ArgvArray
struct ArgvArray
{
	const char **data;
	size_t len;
};

// Convert C argv to Tuff ArgvArray
// Allocates memory that is never freed (lives for program duration)
inline ArgvArray __builtin_argv_convert(int argc, char *argv[])
{
	// Allocate array of pointers
	const char **data = (const char **)malloc(sizeof(const char *) * argc);

	// Copy pointers (strings themselves are in static memory/stack from OS)
	for (int i = 0; i < argc; i++)
	{
		data[i] = argv[i];
	}

	ArgvArray result;
	result.data = data;
	result.len = static_cast<size_t>(argc);
	return result;
}
