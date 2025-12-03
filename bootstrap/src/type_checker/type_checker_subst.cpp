#include "../include/type_checker.h"
#include "../include/expr.h"

ExprPtr TypeChecker::substituteType(ExprPtr type, const std::map<std::string, ExprPtr> &substitutions)
{
	if (!type)
		return nullptr;

	switch (type->kind)
	{
	case ExprKind::IDENTIFIER:
	{
		auto id = type->as<IdentifierExpr>();
		auto it = substitutions.find(id->name);
		if (it != substitutions.end())
		{
			return it->second;
		}
		return type;
	}
	case ExprKind::UNARY:
	{
		auto u = type->as<UnaryExpr>();
		auto newOp = substituteType(u->operand, substitutions);
		if (newOp == u->operand)
			return type;
		return std::make_shared<UnaryExpr>(u->op, newOp);
	}
	case ExprKind::CALL:
	{
		auto c = type->as<CallExpr>();
		bool changed = false;
		std::vector<ExprPtr> newArgs;
		for (auto arg : c->args)
		{
			auto newArg = substituteType(arg, substitutions);
			if (newArg != arg)
				changed = true;
			newArgs.push_back(newArg);
		}
		auto newCallee = substituteType(c->callee, substitutions);
		if (newCallee != c->callee)
			changed = true;

		if (!changed)
			return type;
		return std::make_shared<CallExpr>(newCallee, newArgs, c->isGenericInstantiation);
	}
	case ExprKind::ARRAY:
	{
		auto a = type->as<ArrayExpr>();
		auto newElem = substituteType(a->elementType, substitutions);
		if (newElem == a->elementType)
			return type;
		return std::make_shared<ArrayExpr>(newElem, a->init, a->capacity);
	}
	case ExprKind::BINARY:
	{
		auto b = type->as<BinaryExpr>();
		auto newLeft = substituteType(b->left, substitutions);
		auto newRight = substituteType(b->right, substitutions);
		if (newLeft == b->left && newRight == b->right)
			return type;
		return std::make_shared<BinaryExpr>(b->op, newLeft, newRight);
	}
	default:
		return type;
	}
}
