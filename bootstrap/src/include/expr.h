#pragma once
#include <memory>
#include <string>
#include <vector>

// Forward declarations
class Expr;
using ExprPtr = std::shared_ptr<Expr>;

// Primitive type kinds (as enum, not strings)
enum class PrimitiveKind
{
	I8,
	I16,
	I32,
	I64,
	U8,
	U16,
	U32,
	U64,
	F32,
	F64,
	Bool,
	Void,
	USize
};

// Unary operators
enum class UnaryOp
{
	STAR,	 // * (pointer-to / dereference)
	MUT,	 // mut (mutability marker)
	REF,	 // & (reference-to / address-of)
	HASH,	 // # (destructor marker)
	MINUS, // - (negation)
	NOT,	 // ! (logical not)
	BITNOT // ~ (bitwise not)
};

// Binary operators
enum class BinaryOp
{
	// Arithmetic
	ADD,
	SUB,
	MUL,
	DIV,
	MOD,
	// Comparison
	LT,
	GT,
	LE,
	GE,
	EQ,
	NE,
	// Logical
	AND,
	OR,
	// Bitwise
	BIT_AND,
	BIT_OR,
	BIT_XOR,
	SHL,
	SHR,
	// Type operators
	UNION,			 // |
	INTERSECTION // & (when used in type context)
};

// Expression kinds
enum class ExprKind
{
	// Literals
	INT_LITERAL,
	FLOAT_LITERAL,
	BOOL_LITERAL,
	STRING_LITERAL,

	// Primitives (type expressions)
	PRIMITIVE,

	// Identifiers
	IDENTIFIER,

	// Operators
	UNARY,
	BINARY,

	// Compound
	ARRAY,				// [T; init; cap]
	CALL,					// func(args) or Generic<Args>
	FIELD_ACCESS, // a.b, this.init
	INDEX,				// a[i]

	// Special
	IF_EXPR, // if (cond) a else b
	BLOCK,	 // { stmts; expr }

	// Type-specific
	SIZEOF // sizeOf(T)
};

// Base expression class
class Expr : public std::enable_shared_from_this<Expr>
{
public:
	ExprKind kind;
	int line = 0;
	int column = 0;

	explicit Expr(ExprKind k) : kind(k) {}
	virtual ~Expr() = default;

	// For debugging and error messages
	virtual std::string toString() const = 0;

	// Type checking helpers
	template <typename T>
	bool is() const { return dynamic_cast<const T *>(this) != nullptr; }

	template <typename T>
	T *as() { return dynamic_cast<T *>(this); }

	template <typename T>
	const T *as() const { return dynamic_cast<const T *>(this); }
};

// Integer literal: 5, 10U8, 0xFF
class IntLiteralExpr : public Expr
{
public:
	int64_t value;
	std::string suffix; // "", "U8", "I32", etc.

	IntLiteralExpr(int64_t v, const std::string &s = "")
			: Expr(ExprKind::INT_LITERAL), value(v), suffix(s) {}

	std::string toString() const override
	{
		return std::to_string(value) + suffix;
	}
};

// Float literal: 3.14, 2.0F32
class FloatLiteralExpr : public Expr
{
public:
	double value;
	std::string suffix; // "", "F32", "F64"

	FloatLiteralExpr(double v, const std::string &s = "")
			: Expr(ExprKind::FLOAT_LITERAL), value(v), suffix(s) {}

	std::string toString() const override
	{
		return std::to_string(value) + suffix;
	}
};

// Bool literal: true, false
class BoolLiteralExpr : public Expr
{
public:
	bool value;

	explicit BoolLiteralExpr(bool v)
			: Expr(ExprKind::BOOL_LITERAL), value(v) {}

	std::string toString() const override
	{
		return value ? "true" : "false";
	}
};

// String literal: "hello"
class StringLiteralExpr : public Expr
{
public:
	std::string value;

	explicit StringLiteralExpr(const std::string &v)
			: Expr(ExprKind::STRING_LITERAL), value(v) {}

	std::string toString() const override
	{
		return "\"" + value + "\"";
	}
};

// Primitive type: I32, Bool, Void, USize
class PrimitiveExpr : public Expr
{
public:
	PrimitiveKind primitiveKind;

	explicit PrimitiveExpr(PrimitiveKind k)
			: Expr(ExprKind::PRIMITIVE), primitiveKind(k) {}

	std::string toString() const override
	{
		switch (primitiveKind)
		{
		case PrimitiveKind::I8:
			return "I8";
		case PrimitiveKind::I16:
			return "I16";
		case PrimitiveKind::I32:
			return "I32";
		case PrimitiveKind::I64:
			return "I64";
		case PrimitiveKind::U8:
			return "U8";
		case PrimitiveKind::U16:
			return "U16";
		case PrimitiveKind::U32:
			return "U32";
		case PrimitiveKind::U64:
			return "U64";
		case PrimitiveKind::F32:
			return "F32";
		case PrimitiveKind::F64:
			return "F64";
		case PrimitiveKind::Bool:
			return "Bool";
		case PrimitiveKind::Void:
			return "Void";
		case PrimitiveKind::USize:
			return "USize";
		}
		return "Unknown";
	}
};

// Identifier: x, T, MyStruct
class IdentifierExpr : public Expr
{
public:
	std::string name;
	std::vector<std::string> path; // For FQN: com::example::Thing

	explicit IdentifierExpr(const std::string &n)
			: Expr(ExprKind::IDENTIFIER), name(n) {}

	IdentifierExpr(const std::vector<std::string> &p, const std::string &n)
			: Expr(ExprKind::IDENTIFIER), name(n), path(p) {}

	std::string toString() const override
	{
		std::string result;
		for (const auto &p : path)
		{
			result += p + "::";
		}
		return result + name;
	}
};

// Unary expression: *T, &x, #free, mut T, !x, -x, ~x
class UnaryExpr : public Expr
{
public:
	UnaryOp op;
	ExprPtr operand;

	UnaryExpr(UnaryOp o, ExprPtr e)
			: Expr(ExprKind::UNARY), op(o), operand(std::move(e)) {}

	std::string toString() const override
	{
		std::string opStr;
		switch (op)
		{
		case UnaryOp::STAR:
			opStr = "*";
			break;
		case UnaryOp::MUT:
			opStr = "mut ";
			break;
		case UnaryOp::REF:
			opStr = "&";
			break;
		case UnaryOp::HASH:
			opStr = "#";
			break;
		case UnaryOp::MINUS:
			opStr = "-";
			break;
		case UnaryOp::NOT:
			opStr = "!";
			break;
		case UnaryOp::BITNOT:
			opStr = "~";
			break;
		}
		return opStr + operand->toString();
	}
};

// Binary expression: a + b, a < b, A | B, A & B
class BinaryExpr : public Expr
{
public:
	BinaryOp op;
	ExprPtr left;
	ExprPtr right;

	BinaryExpr(BinaryOp o, ExprPtr l, ExprPtr r)
			: Expr(ExprKind::BINARY), op(o), left(std::move(l)), right(std::move(r)) {}

	std::string toString() const override
	{
		std::string opStr;
		switch (op)
		{
		case BinaryOp::ADD:
			opStr = "+";
			break;
		case BinaryOp::SUB:
			opStr = "-";
			break;
		case BinaryOp::MUL:
			opStr = "*";
			break;
		case BinaryOp::DIV:
			opStr = "/";
			break;
		case BinaryOp::MOD:
			opStr = "%";
			break;
		case BinaryOp::LT:
			opStr = "<";
			break;
		case BinaryOp::GT:
			opStr = ">";
			break;
		case BinaryOp::LE:
			opStr = "<=";
			break;
		case BinaryOp::GE:
			opStr = ">=";
			break;
		case BinaryOp::EQ:
			opStr = "==";
			break;
		case BinaryOp::NE:
			opStr = "!=";
			break;
		case BinaryOp::AND:
			opStr = "&&";
			break;
		case BinaryOp::OR:
			opStr = "||";
			break;
		case BinaryOp::BIT_AND:
			opStr = "&";
			break;
		case BinaryOp::BIT_OR:
			opStr = "|";
			break;
		case BinaryOp::BIT_XOR:
			opStr = "^";
			break;
		case BinaryOp::SHL:
			opStr = "<<";
			break;
		case BinaryOp::SHR:
			opStr = ">>";
			break;
		case BinaryOp::UNION:
			opStr = "|";
			break;
		case BinaryOp::INTERSECTION:
			opStr = "&";
			break;
		}
		return left->toString() + " " + opStr + " " + right->toString();
	}
};

// Array type: [T; init; cap] or [T] (slice)
class ArrayExpr : public Expr
{
public:
	ExprPtr elementType;
	ExprPtr init;			// nullptr for slices
	ExprPtr capacity; // nullptr for slices

	explicit ArrayExpr(ExprPtr elem)
			: Expr(ExprKind::ARRAY), elementType(std::move(elem)) {}

	ArrayExpr(ExprPtr elem, ExprPtr i, ExprPtr c)
			: Expr(ExprKind::ARRAY), elementType(std::move(elem)),
				init(std::move(i)), capacity(std::move(c)) {}

	bool isSlice() const { return init == nullptr; }

	std::string toString() const override
	{
		if (isSlice())
		{
			return "[" + elementType->toString() + "]";
		}
		return "[" + elementType->toString() + "; " +
					 init->toString() + "; " + capacity->toString() + "]";
	}
};

// Function call or generic instantiation: func(args) or Generic<Args>
class CallExpr : public Expr
{
public:
	ExprPtr callee;
	std::vector<ExprPtr> args;
	bool isGenericInstantiation = false; // true for Generic<Args>

	CallExpr(ExprPtr c, std::vector<ExprPtr> a, bool generic = false)
			: Expr(ExprKind::CALL), callee(std::move(c)),
				args(std::move(a)), isGenericInstantiation(generic) {}

	std::string toString() const override
	{
		std::string result = callee->toString();
		result += isGenericInstantiation ? "<" : "(";
		for (size_t i = 0; i < args.size(); i++)
		{
			if (i > 0)
				result += ", ";
			result += args[i]->toString();
		}
		result += isGenericInstantiation ? ">" : ")";
		return result;
	}
};

// Field access: a.b, this.init
class FieldAccessExpr : public Expr
{
public:
	ExprPtr object;
	std::string field;

	FieldAccessExpr(ExprPtr o, const std::string &f)
			: Expr(ExprKind::FIELD_ACCESS), object(std::move(o)), field(f) {}

	std::string toString() const override
	{
		return object->toString() + "." + field;
	}
};

// Index expression: a[i]
class IndexExpr : public Expr
{
public:
	ExprPtr object;
	ExprPtr index;

	IndexExpr(ExprPtr o, ExprPtr i)
			: Expr(ExprKind::INDEX), object(std::move(o)), index(std::move(i)) {}

	std::string toString() const override
	{
		return object->toString() + "[" + index->toString() + "]";
	}
};

// If expression: if (cond) a else b
class IfExpr : public Expr
{
public:
	ExprPtr condition;
	ExprPtr thenBranch;
	ExprPtr elseBranch; // nullptr if no else

	IfExpr(ExprPtr c, ExprPtr t, ExprPtr e = nullptr)
			: Expr(ExprKind::IF_EXPR), condition(std::move(c)),
				thenBranch(std::move(t)), elseBranch(std::move(e)) {}

	std::string toString() const override
	{
		std::string result = "if (" + condition->toString() + ") " +
												 thenBranch->toString();
		if (elseBranch)
		{
			result += " else " + elseBranch->toString();
		}
		return result;
	}
};

// SizeOf expression: sizeOf(T)
class SizeOfExpr : public Expr
{
public:
	ExprPtr typeArg;

	explicit SizeOfExpr(ExprPtr t)
			: Expr(ExprKind::SIZEOF), typeArg(std::move(t)) {}

	std::string toString() const override
	{
		return "sizeOf(" + typeArg->toString() + ")";
	}
};

// Helper functions to create expressions
inline ExprPtr makeInt(int64_t v, const std::string &suffix = "")
{
	return std::make_shared<IntLiteralExpr>(v, suffix);
}

inline ExprPtr makeBool(bool v)
{
	return std::make_shared<BoolLiteralExpr>(v);
}

inline ExprPtr makePrimitive(PrimitiveKind k)
{
	return std::make_shared<PrimitiveExpr>(k);
}

inline ExprPtr makeId(const std::string &name)
{
	return std::make_shared<IdentifierExpr>(name);
}

inline ExprPtr makeUnary(UnaryOp op, ExprPtr e)
{
	return std::make_shared<UnaryExpr>(op, std::move(e));
}

inline ExprPtr makeBinary(BinaryOp op, ExprPtr l, ExprPtr r)
{
	return std::make_shared<BinaryExpr>(op, std::move(l), std::move(r));
}

inline ExprPtr makePtr(ExprPtr e)
{
	return makeUnary(UnaryOp::STAR, std::move(e));
}

inline ExprPtr makePtrMut(ExprPtr e)
{
	return makeUnary(UnaryOp::STAR, makeUnary(UnaryOp::MUT, std::move(e)));
}

inline ExprPtr makeArray(ExprPtr elem, ExprPtr init, ExprPtr cap)
{
	return std::make_shared<ArrayExpr>(std::move(elem), std::move(init), std::move(cap));
}

inline ExprPtr makeSlice(ExprPtr elem)
{
	return std::make_shared<ArrayExpr>(std::move(elem));
}
