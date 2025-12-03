// Process execution builtins for Tuff
// Provides ability to execute external programs

#ifndef TUFF_PROCESS_BUILTINS_H
#define TUFF_PROCESS_BUILTINS_H

#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <string>

#ifdef _WIN32
#include <direct.h>
#define TUFF_GETCWD _getcwd
#define TUFF_CHDIR _chdir
#else
#include <unistd.h>
#define TUFF_GETCWD getcwd
#define TUFF_CHDIR chdir
#endif

// Execute a command with arguments in a specified working directory
// Returns the exit code of the process, or -1 on failure
// program: the program to execute
// args: array of argument strings (first arg should be program name by convention)
// argCount: number of arguments
// cwd: working directory to execute in (empty string = current directory)
inline int32_t __builtin_process_execute(const char *program, const char **args, size_t argCount, const char *cwd)
{
	// Build command string for std::system()
	std::string command;

	// Add the program
	command += program;

	// Add all arguments
	for (size_t i = 0; i < argCount; i++)
	{
		command += " ";
		// Simple quoting for arguments with spaces (Windows-style)
		std::string arg = args[i];
		if (arg.find(' ') != std::string::npos || arg.find('\t') != std::string::npos)
		{
			command += "\"";
			command += arg;
			command += "\"";
		}
		else
		{
			command += arg;
		}
	}

	// Save current directory if we need to change it
	char oldCwd[4096];
	bool changedDir = false;

	if (cwd != nullptr && cwd[0] != '\0')
	{
		if (TUFF_GETCWD(oldCwd, sizeof(oldCwd)) != nullptr)
		{
			if (TUFF_CHDIR(cwd) == 0)
			{
				changedDir = true;
			}
			else
			{
				// Failed to change directory
				return -1;
			}
		}
	}

	// Execute the command
	int result = std::system(command.c_str());

	// Restore original directory if we changed it
	if (changedDir)
	{
		TUFF_CHDIR(oldCwd);
	}

	// On Windows, std::system returns the exit code directly
	// On POSIX, need to use WEXITSTATUS but we're Windows-only for now
	return static_cast<int32_t>(result);
}

#endif // TUFF_PROCESS_BUILTINS_H
