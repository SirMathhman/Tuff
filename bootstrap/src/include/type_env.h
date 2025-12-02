#pragma once
#include <map>
#include <string>

// TypeEnvironment tracks type variable substitutions for generics
// Works with string-based types in the current system
// Example: When calling malloc<I32>, bind T -> I32
// Then substitute "T" in return type "*mut [T]" to get "*mut [I32]"

class TypeEnvironment
{
public:
	TypeEnvironment() = default;

	// Bind a type variable to a concrete type
	// Example: bind("T", "I32")
	void bind(const std::string &typeVar, const std::string &concreteType);

	// Apply substitutions to a type string
	// Example: substitute("*mut [T]") with T->I32 returns "*mut [I32]"
	std::string substitute(const std::string &type) const;

	// Create a child environment that inherits this environment's bindings
	TypeEnvironment createChild() const;

	// Check if a type variable is bound
	bool isBound(const std::string &typeVar) const;

	// Get the binding for a type variable (empty string if not bound)
	std::string getBinding(const std::string &typeVar) const;

	// Clear all bindings
	void clear() { substitutions.clear(); }

	// Debug: print all bindings
	void print() const;

private:
	std::map<std::string, std::string> substitutions;

	// Helper: substitute a comma-separated list of types
	std::string substituteCsv(const std::string &types) const;

	// Helper: trim whitespace from both ends
	static std::string trim(const std::string &str);
};
