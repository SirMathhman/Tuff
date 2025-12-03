#ifndef TUFF_PROCESS_BUILTINS_H
#define TUFF_PROCESS_BUILTINS_H

#include <cstdlib>
#include <cstdint>
#include <string>
#include <sstream>

// Execute a system command and return exit code
inline int32_t __builtin_process_execute(const char *command)
{
	return std::system(command);
}

// Execute a command with arguments (simple version - just concatenate for now)
inline int32_t __builtin_process_execute(const char *program, const char **args, size_t argCount, const char *cwd)
{
	// Build command string
	std::ostringstream cmd;
	cmd << program;
	for (size_t i = 0; i < argCount; i++)
	{
		cmd << " " << args[i];
	}

	// Note: cwd parameter is ignored in this simple implementation
	return std::system(cmd.str().c_str());
}

#endif // TUFF_PROCESS_BUILTINS_H
