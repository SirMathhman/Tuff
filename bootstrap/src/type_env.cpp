#include "include/type_env.h"
#include <iostream>

ExprPtr TypeEnvironment::substitute(ExprPtr type)
{
	if (!type)
		return nullptr;

	switch (type->kind)
	{
	case ExprKind::IDENTIFIER:
	{
		auto id = type->as<IdentifierExpr>();
		// If it's a type variable we have a substitution for
		if (substitutions.count(id->name))
		{
			return substitutions.at(id->name);
		}
		return type;
	}

	case ExprKind::PRIMITIVE:
	case ExprKind::INT_LITERAL:
	case ExprKind::FLOAT_LITERAL:
	case ExprKind::BOOL_LITERAL:
	case ExprKind::STRING_LITERAL:
		return type; // No substitution needed

	case ExprKind::UNARY:
	{
		auto unary = type->as<UnaryExpr>();
		auto newOperand = substitute(unary->operand);
		if (newOperand != unary->operand)
		{
			return std::make_shared<UnaryExpr>(unary->op, newOperand);
		}
		return type;
	}

	case ExprKind::BINARY:
	{
		auto binary = type->as<BinaryExpr>();
		auto newLeft = substitute(binary->left);
		auto newRight = substitute(binary->right);
		if (newLeft != binary->left || newRight != binary->right)
		{
			return std::make_shared<BinaryExpr>(binary->op, newLeft, newRight);
		}
		return type;
	}

	case ExprKind::ARRAY:
	{
		auto array = type->as<ArrayExpr>();
		auto newElem = substitute(array->elementType);
		auto newInit = substitute(array->init);
		auto newCap = substitute(array->capacity);

		if (newElem != array->elementType || newInit != array->init || newCap != array->capacity)
		{
			if (array->isSlice())
			{
				return std::make_shared<ArrayExpr>(newElem);
			}
			else
			{
				return std::make_shared<ArrayExpr>(newElem, newInit, newCap);
			}
		}
		return type;
	}

	case ExprKind::CALL:
	{
		auto call = type->as<CallExpr>();
		auto newCallee = substitute(call->callee);
		std::vector<ExprPtr> newArgs;
		bool changed = newCallee != call->callee;

		for (const auto &arg : call->args)
		{
			auto newArg = substitute(arg);
			if (newArg != arg)
				changed = true;
			newArgs.push_back(newArg);
		}

		if (changed)
		{
			return std::make_shared<CallExpr>(newCallee, newArgs, call->isGenericInstantiation);
		}
		return type;
	}

	case ExprKind::FUNCTION:
	{
		auto func = type->as<FunctionExpr>();
		std::vector<ExprPtr> newParams;
		bool changed = false;

		for (const auto &param : func->paramTypes)
		{
			auto newParam = substitute(param);
			if (newParam != param)
				changed = true;
			newParams.push_back(newParam);
		}

		auto newRet = substitute(func->returnType);
		if (newRet != func->returnType)
			changed = true;

		if (changed)
		{
			return std::make_shared<FunctionExpr>(newParams, newRet, func->genericParams);
		}
		return type;
	}

	case ExprKind::SIZEOF:
	{
		auto sz = type->as<SizeOfExpr>();
		auto newType = substitute(sz->typeArg);
		if (newType != sz->typeArg)
		{
			return std::make_shared<SizeOfExpr>(newType);
		}
		return type;
	}

	default:
		return type;
	}
}

bool TypeEnvironment::unify(ExprPtr expected, ExprPtr actual)
{
	if (!expected || !actual)
		return false;

	// If they are the same object, they match
	if (expected == actual)
		return true;

	// If expected is a type variable (Identifier), bind it
	if (expected->kind == ExprKind::IDENTIFIER)
	{
		auto id = expected->as<IdentifierExpr>();
		// Check if it's a generic param we should bind
		// For now, assume all identifiers in 'expected' position that are not concrete types are bindable
		// In a real system we'd check against a set of generic params
		// But here we might be unifying T with I32

		// If we already have a substitution, unify with it
		if (substitutions.count(id->name))
		{
			return unify(substitutions[id->name], actual);
		}

		// Otherwise bind it
		addSubstitution(id->name, actual);
		return true;
	}

	// If kinds don't match, fail (unless one is a type var, handled above)
	if (expected->kind != actual->kind)
		return false;

	switch (expected->kind)
	{
	case ExprKind::PRIMITIVE:
	{
		auto p1 = expected->as<PrimitiveExpr>();
		auto p2 = actual->as<PrimitiveExpr>();
		return p1->primitiveKind == p2->primitiveKind;
	}

	case ExprKind::UNARY:
	{
		auto u1 = expected->as<UnaryExpr>();
		auto u2 = actual->as<UnaryExpr>();
		if (u1->op != u2->op)
			return false;
		return unify(u1->operand, u2->operand);
	}

	case ExprKind::BINARY:
	{
		auto b1 = expected->as<BinaryExpr>();
		auto b2 = actual->as<BinaryExpr>();
		if (b1->op != b2->op)
			return false;
		return unify(b1->left, b2->left) && unify(b1->right, b2->right);
	}

	case ExprKind::ARRAY:
	{
		auto a1 = expected->as<ArrayExpr>();
		auto a2 = actual->as<ArrayExpr>();
		if (a1->isSlice() != a2->isSlice())
			return false;

		if (!unify(a1->elementType, a2->elementType))
			return false;

		if (!a1->isSlice())
		{
			// Check init and capacity
			// For now, strict equality on expressions, or unify if they are types (but they are values)
			// Value unification is harder. For now assume they must match structurally or be literals
			// TODO: Implement value unification if needed for array sizes
		}
		return true;
	}

	case ExprKind::CALL:
	{
		auto c1 = expected->as<CallExpr>();
		auto c2 = actual->as<CallExpr>();
		if (c1->isGenericInstantiation != c2->isGenericInstantiation)
			return false;
		if (!unify(c1->callee, c2->callee))
			return false;
		if (c1->args.size() != c2->args.size())
			return false;
		for (size_t i = 0; i < c1->args.size(); i++)
		{
			if (!unify(c1->args[i], c2->args[i]))
				return false;
		}
		return true;
	}

	case ExprKind::FUNCTION:
	{
		auto f1 = expected->as<FunctionExpr>();
		auto f2 = actual->as<FunctionExpr>();
		if (f1->paramTypes.size() != f2->paramTypes.size())
			return false;

		for (size_t i = 0; i < f1->paramTypes.size(); i++)
		{
			if (!unify(f1->paramTypes[i], f2->paramTypes[i]))
				return false;
		}
		return unify(f1->returnType, f2->returnType);
	}

	default:
		// Fallback to string comparison for now if not handled
		return expected->toString() == actual->toString();
	}
}

void TypeEnvironment::addSubstitution(const std::string &name, ExprPtr type)
{
	substitutions[name] = type;
}

void TypeEnvironment::applySubstitutions(const std::map<std::string, ExprPtr> &subs)
{
	for (const auto &pair : subs)
	{
		substitutions[pair.first] = pair.second;
	}
}
