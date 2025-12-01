#ifndef TUFF_COMPILER_H
#define TUFF_COMPILER_H

#include <string>
#include <stdexcept>

/**
 * Exception thrown when compilation fails.
 */
class CompileError : public std::runtime_error {
public:
    explicit CompileError(const std::string& message) : std::runtime_error(message) {}
};

/**
 * Compile Tuff source code to the specified target.
 * 
 * @param source The Tuff source code as a string
 * @param target The compilation target ("js" or "cpp")
 * @return The generated code as a string
 * @throws CompileError if compilation fails
 */
std::string compile(const std::string& source, const std::string& target);

#endif // TUFF_COMPILER_H
