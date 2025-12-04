#include "../include/type_checker.h"
#include "../include/expr.h"
#include <iostream>

ExprPtr TypeChecker::resolveType(std::shared_ptr<ASTNode> node)
{
	if (!node)
		return nullptr;

	switch (node->type)
	{
	case ASTNodeType::TYPE:
	{
		std::string typeName = node->value;
		if (typeName == "I8")
			return makePrimitive(PrimitiveKind::I8);
		if (typeName == "I16")
			return makePrimitive(PrimitiveKind::I16);
		if (typeName == "I32")
			return makePrimitive(PrimitiveKind::I32);
		if (typeName == "I64")
			return makePrimitive(PrimitiveKind::I64);
		if (typeName == "U8")
			return makePrimitive(PrimitiveKind::U8);
		if (typeName == "U16")
			return makePrimitive(PrimitiveKind::U16);
		if (typeName == "U32")
			return makePrimitive(PrimitiveKind::U32);
		if (typeName == "U64")
			return makePrimitive(PrimitiveKind::U64);
		if (typeName == "F32")
			return makePrimitive(PrimitiveKind::F32);
		if (typeName == "F64")
			return makePrimitive(PrimitiveKind::F64);
		if (typeName == "Bool")
			return makePrimitive(PrimitiveKind::Bool);
		if (typeName == "Void")
			return makePrimitive(PrimitiveKind::Void);
		if (typeName == "USize")
			return makePrimitive(PrimitiveKind::USize);

		// If it's not a primitive, it's an identifier (struct, enum, alias, generic)
		// Check if it has generic args
		if (!node->genericArgsNodes.empty())
		{
			std::vector<ExprPtr> args;
			for (auto argNode : node->genericArgsNodes)
			{
				args.push_back(resolveType(argNode));
			}
			return std::make_shared<CallExpr>(makeId(typeName), args, true);
		}

		return makeId(typeName);
	}

	case ASTNodeType::POINTER_TYPE:
	{
		// node->value is usually empty or "*"
		// children[0] is the pointed-to type
		// node->isMutable tells if it's *mut
		auto inner = resolveType(node->children[0]);
		if (node->isMutable)
		{
			return makePtrMut(inner);
		}
		else
		{
			return makePtr(inner);
		}
	}

	case ASTNodeType::ARRAY_TYPE:
	{
		// children[0] is element type
		auto elemType = resolveType(node->children[0]);

		// children[1] is init (expression)
		// children[2] is capacity (expression)
		// But wait, array type in AST might store these as expressions or values?
		// Let's check parser_types.cpp

		// If it's a slice, it might not have init/cap
		if (node->children.size() > 1)
		{
			// It has init and cap
			// We need to convert AST expressions to ExprPtr expressions
			// This requires a resolveExpr function, not just resolveType
			// For now, let's assume they are literals or simple identifiers
			// and we might need a full expression converter later.

			// Placeholder: use dummy expressions if we can't convert yet
			// Or better, implement a basic resolveExpr
			return makeArray(elemType, nullptr, nullptr); // TODO: Fix array dimensions
		}
		else
		{
			return makeSlice(elemType);
		}
	}

	case ASTNodeType::FUNCTION_PTR_TYPE:
	{
		// Function pointer type: |T1, T2| => RetType
		// node->value is the param count as string
		// children[0..n-1] are param types, children[n] is return type
		size_t paramCount = std::stoul(node->value);
		std::vector<ExprPtr> paramTypes;
		for (size_t i = 0; i < paramCount; i++)
		{
			paramTypes.push_back(resolveType(node->children[i]));
		}
		auto returnType = resolveType(node->children[paramCount]);
		return std::make_shared<FunctionExpr>(paramTypes, returnType);
	}

	case ASTNodeType::BINARY_OP:
	{
		// Union or Intersection types
		if (node->value == "|")
		{
			return makeBinary(BinaryOp::UNION, resolveType(node->children[0]), resolveType(node->children[1]));
		}
		if (node->value == "&")
		{
			return makeBinary(BinaryOp::INTERSECTION, resolveType(node->children[0]), resolveType(node->children[1]));
		}
		break;
	}

	default:
		break;
	}
	return nullptr;
}

std::string TypeChecker::exprTypeToString(ExprPtr type)
{
	if (!type)
		return "Unknown";
	return type->toString();
}

bool TypeChecker::areTypesEqual(ExprPtr t1, ExprPtr t2)
{
	if (!t1 || !t2)
		return false;
	if (t1 == t2)
		return true;

	if (t1->kind != t2->kind)
		return false;

	switch (t1->kind)
	{
	case ExprKind::PRIMITIVE:
	{
		auto p1 = t1->as<PrimitiveExpr>();
		auto p2 = t2->as<PrimitiveExpr>();
		return p1->primitiveKind == p2->primitiveKind;
	}
	case ExprKind::IDENTIFIER:
	{
		auto i1 = t1->as<IdentifierExpr>();
		auto i2 = t2->as<IdentifierExpr>();
		// Compare name and path
		if (i1->name != i2->name)
			return false;
		if (i1->path.size() != i2->path.size())
			return false;
		for (size_t i = 0; i < i1->path.size(); i++)
		{
			if (i1->path[i] != i2->path[i])
				return false;
		}
		return true;
	}
	case ExprKind::UNARY:
	{
		// Pointer types: *T, *mut T
		auto u1 = t1->as<UnaryExpr>();
		auto u2 = t2->as<UnaryExpr>();
		if (u1->op != u2->op)
			return false;
		return areTypesEqual(u1->operand, u2->operand);
	}
	case ExprKind::CALL:
	{
		// Generic types: Vec<T>
		auto c1 = t1->as<CallExpr>();
		auto c2 = t2->as<CallExpr>();
		if (!c1->isGenericInstantiation || !c2->isGenericInstantiation)
			return false;
		if (!areTypesEqual(c1->callee, c2->callee))
			return false;
		if (c1->args.size() != c2->args.size())
			return false;
		for (size_t i = 0; i < c1->args.size(); i++)
		{
			if (!areTypesEqual(c1->args[i], c2->args[i]))
				return false;
		}
		return true;
	}
	case ExprKind::ARRAY:
	{
		auto a1 = t1->as<ArrayExpr>();
		auto a2 = t2->as<ArrayExpr>();
		if (!areTypesEqual(a1->elementType, a2->elementType))
			return false;
		// Check dimensions if present
		// For now, assume strict equality on dimensions if they exist
		// But dimensions are expressions, so we need expression equality?
		// Or just structural equality.
		// TODO: Implement expression equality
		return true;
	}
	case ExprKind::BINARY:
	{
		// Union types: A | B
		auto b1 = t1->as<BinaryExpr>();
		auto b2 = t2->as<BinaryExpr>();
		if (b1->op != b2->op)
			return false;
		return areTypesEqual(b1->left, b2->left) && areTypesEqual(b1->right, b2->right);
	}
	default:
		return false;
	}
}

bool TypeChecker::isTypeCompatible(ExprPtr valueType, ExprPtr targetType)
{
	if (!valueType || !targetType)
		return false;

	// Exact match
	if (areTypesEqual(valueType, targetType))
		return true;

	// Debugging: Print types if they look the same but are not equal
	if (exprTypeToString(valueType) == exprTypeToString(targetType))
	{
		std::cerr << "DEBUG: Types look same but areTypesEqual returned false: " << exprTypeToString(valueType) << std::endl;
		// Check why they are not equal
		if (valueType->kind != targetType->kind)
		{
			std::cerr << "DEBUG: Kinds differ: " << (int)valueType->kind << " vs " << (int)targetType->kind << std::endl;
		}
	}

	// Array-to-string decay: [U8; N; N] -> string
	// string is an extern type that represents a pointer to byte array
	if (targetType->kind == ExprKind::IDENTIFIER)
	{
		auto targetId = targetType->as<IdentifierExpr>();
		if (targetId->name == "string")
		{
			// Check if value is [U8; N; N]
			if (valueType->kind == ExprKind::ARRAY)
			{
				auto arrType = valueType->as<ArrayExpr>();
				if (arrType->elementType->kind == ExprKind::PRIMITIVE)
				{
					auto elemPrim = arrType->elementType->as<PrimitiveExpr>();
					if (elemPrim->primitiveKind == PrimitiveKind::U8)
					{
						return true; // [U8; N; N] can decay to string
					}
				}
			}
		}
	}

	// Integer literal widening (I32 -> any int)
	// TODO: This is unsafe for variables, should be restricted to literals or use bidirectional checking
	if (valueType->kind == ExprKind::PRIMITIVE && targetType->kind == ExprKind::PRIMITIVE)
	{
		auto pVal = valueType->as<PrimitiveExpr>();

		if (pVal->primitiveKind == PrimitiveKind::I32 && isIntegerType(targetType))
		{
			return true;
		}
	}

	// Pointer mutability coercion: *mut T -> *T
	if (valueType->kind == ExprKind::UNARY && targetType->kind == ExprKind::UNARY)
	{
		auto v = valueType->as<UnaryExpr>();
		auto t = targetType->as<UnaryExpr>();

		// Check for *mut T -> *T
		// *mut T is represented as Unary(STAR, Unary(MUT, T))
		// *T is represented as Unary(STAR, T)

		if (v->op == UnaryOp::STAR && t->op == UnaryOp::STAR)
		{
			// Check if value is *mut T
			if (v->operand->kind == ExprKind::UNARY)
			{
				auto vMut = v->operand->as<UnaryExpr>();
				if (vMut->op == UnaryOp::MUT)
				{
					// Value is *mut T. Target is *U.
					// Compatible if T == U.
					return areTypesEqual(vMut->operand, t->operand);
				}
			}
		}
	}

	// Union type compatibility
	// If target is A | B, value is compatible if it is compatible with A or B
	if (targetType->kind == ExprKind::BINARY)
	{
		auto bin = targetType->as<BinaryExpr>();
		if (bin->op == BinaryOp::UNION)
		{
			if (isTypeCompatible(valueType, bin->left))
				return true;
			if (isTypeCompatible(valueType, bin->right))
				return true;
		}
	}

	return false;
}

// Strip intersection types: T & #free -> T, *mut [T] & #free -> *mut [T]
ExprPtr TypeChecker::stripIntersection(ExprPtr type)
{
	if (!type)
		return nullptr;

	if (type->kind == ExprKind::BINARY)
	{
		auto bin = type->as<BinaryExpr>();
		if (bin->op == BinaryOp::INTERSECTION)
		{
			// For T & #free, we want the left side (the actual type)
			// Recursively strip in case of nested intersections
			return stripIntersection(bin->left);
		}
	}

	return type;
}

// Comprehensive assignability check: can we assign sourceType to a variable of targetType?
// Handles:
// - Exact type matches
// - Intersection type stripping (T & #free assignable to T)
// - Pointer mutability coercion (*mut T assignable to *T)
// - Union type compatibility (T assignable to T | U)
// - Integer literal widening
bool TypeChecker::isAssignableTo(ExprPtr sourceType, ExprPtr targetType)
{
	if (!sourceType || !targetType)
		return false;

	// First, strip intersection types from source
	// e.g., *mut [T] & #free should be assignable to *mut [T]
	ExprPtr strippedSource = stripIntersection(sourceType);

	// Also strip from target (for bidirectional compatibility)
	ExprPtr strippedTarget = stripIntersection(targetType);

	// Exact match after stripping
	if (areTypesEqual(strippedSource, strippedTarget))
		return true;

	// Try the basic compatibility check
	if (isTypeCompatible(strippedSource, strippedTarget))
		return true;

	// Special case: *mut T to *T coercion with intersection
	// *mut [T] & #free should be assignable to *mut [T]
	if (strippedSource->kind == ExprKind::UNARY && strippedTarget->kind == ExprKind::UNARY)
	{
		auto src = strippedSource->as<UnaryExpr>();
		auto tgt = strippedTarget->as<UnaryExpr>();

		if (src->op == UnaryOp::STAR && tgt->op == UnaryOp::STAR)
		{
			// Both are pointers. Check if inner types are compatible after stripping
			ExprPtr srcInner = stripIntersection(src->operand);
			ExprPtr tgtInner = stripIntersection(tgt->operand);

			// *mut T -> *mut T (exact)
			if (areTypesEqual(srcInner, tgtInner))
				return true;

			// *mut T -> *T (mut to immut coercion)
			if (srcInner->kind == ExprKind::UNARY)
			{
				auto srcMut = srcInner->as<UnaryExpr>();
				if (srcMut->op == UnaryOp::MUT)
				{
					// Source is *mut T, target is *U
					// Check if T == U
					if (areTypesEqual(srcMut->operand, tgtInner))
						return true;

					// Also check if inner types are compatible after stripping
					ExprPtr srcBase = stripIntersection(srcMut->operand);
					ExprPtr tgtBase = stripIntersection(tgtInner);
					if (areTypesEqual(srcBase, tgtBase))
						return true;
				}
			}
		}
	}

	return false;
}

bool TypeChecker::isNumericType(ExprPtr type)
{
	if (!type)
		return false;
	if (type->kind == ExprKind::PRIMITIVE)
	{
		auto p = type->as<PrimitiveExpr>();
		return p->primitiveKind != PrimitiveKind::Bool &&
					 p->primitiveKind != PrimitiveKind::Void;
	}
	if (type->kind == ExprKind::SIZEOF)
		return true; // SizeOf<T> is numeric (USize)
	return false;
}

bool TypeChecker::isIntegerType(ExprPtr type)
{
	if (!type)
		return false;
	if (type->kind == ExprKind::PRIMITIVE)
	{
		auto p = type->as<PrimitiveExpr>();
		return p->primitiveKind == PrimitiveKind::I8 ||
					 p->primitiveKind == PrimitiveKind::I16 ||
					 p->primitiveKind == PrimitiveKind::I32 ||
					 p->primitiveKind == PrimitiveKind::I64 ||
					 p->primitiveKind == PrimitiveKind::U8 ||
					 p->primitiveKind == PrimitiveKind::U16 ||
					 p->primitiveKind == PrimitiveKind::U32 ||
					 p->primitiveKind == PrimitiveKind::U64 ||
					 p->primitiveKind == PrimitiveKind::USize;
	}
	if (type->kind == ExprKind::SIZEOF)
		return true;
	return false;
}

bool TypeChecker::isFloatType(ExprPtr type)
{
	if (!type)
		return false;
	if (type->kind == ExprKind::PRIMITIVE)
	{
		auto p = type->as<PrimitiveExpr>();
		return p->primitiveKind == PrimitiveKind::F32 ||
					 p->primitiveKind == PrimitiveKind::F64;
	}
	return false;
}

bool TypeChecker::isBoolType(ExprPtr type)
{
	if (!type)
		return false;
	if (type->kind == ExprKind::PRIMITIVE)
	{
		auto p = type->as<PrimitiveExpr>();
		return p->primitiveKind == PrimitiveKind::Bool;
	}
	return false;
}
