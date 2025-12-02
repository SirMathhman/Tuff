#pragma once
#include <map>
#include <string>
#include <memory>
#include "expr.h"

class TypeEnvironment
{
private:
	std::map<std::string, ExprPtr> typeVariables; // T -> I32, U -> String
	std::map<std::string, ExprPtr> substitutions; // T -> ExprPtr

public:
	// Substitute all type vars in an expression
	ExprPtr substitute(ExprPtr type);

	// Unify two types (check if they match)
	// Returns true if unification succeeded
	bool unify(ExprPtr expected, ExprPtr actual);

	// Add a substitution
	void addSubstitution(const std::string &name, ExprPtr type);

	// Apply a map of substitutions
	void applySubstitutions(const std::map<std::string, ExprPtr> &subs);

	// Get current substitutions
	const std::map<std::string, ExprPtr> &getSubstitutions() const { return substitutions; }

	// Clear substitutions
	void clear() { substitutions.clear(); }
};
