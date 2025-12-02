#pragma once

#include <string>
#include <vector>
#include <memory>
#include <variant>
#include "expr.h"

// ============================================================================
// AST TYPED - Sealed Unions via std::variant
// ============================================================================
// All types are in the 'ast' namespace to avoid conflicts with expr.h types
// ============================================================================

namespace ast
{

	// Forward declarations
	struct Literal;
	struct Identifier;
	struct BinaryOp;
	struct UnaryOp;
	struct Reference;
	struct Deref;
	struct FieldAccess;
	struct Index;
	struct Call;
	struct StructLiteral;
	struct ArrayLiteral;
	struct If;
	struct Match;
	struct MatchArm;
	struct Is;
	struct SizeOf;
	struct Block;
	struct EnumValue;

	struct Let;
	struct Assignment;
	struct IfStmt;
	struct While;
	struct Loop;
	struct Break;
	struct Continue;
	struct Return;
	struct ExprStmt;
	struct Function;
	struct Struct;
	struct Enum;
	struct Expect;
	struct Actual;
	struct ExternFn;
	struct TypeAlias;
	struct Module;
	struct Use;
	struct Program;

	struct PrimitiveType;
	struct PointerType;
	struct ArrayType;
	struct NamedType;
	struct UnionType;
	struct IntersectionType;
	struct FunctionType;

	// Expression Variant
	using Expr = std::variant<
			Literal, Identifier, BinaryOp, UnaryOp, Reference, Deref,
			FieldAccess, Index, Call, StructLiteral, ArrayLiteral,
			If, Match, Is, SizeOf, Block, EnumValue>;
	using ExprPtr = std::shared_ptr<Expr>;

	// Statement Variant
	using Stmt = std::variant<
			Let, Assignment, IfStmt, While, Loop, Break, Continue, Return, ExprStmt>;
	using StmtPtr = std::shared_ptr<Stmt>;

	// Declaration Variant
	using Decl = std::variant<
			Function, Struct, Enum, Expect, Actual, ExternFn, TypeAlias, Module, Use>;
	using DeclPtr = std::shared_ptr<Decl>;

	// Type Variant
	using Type = std::variant<
			PrimitiveType, PointerType, ArrayType, NamedType,
			UnionType, IntersectionType, FunctionType>;
	using TypePtr = std::shared_ptr<Type>;

	// Type structures
	struct PrimitiveType
	{
		std::string name;
	};
	struct PointerType
	{
		TypePtr pointee;
		bool isMutable = false;
		std::string lifetime;
	};
	struct ArrayType
	{
		TypePtr elementType;
		ExprPtr initCount;
		ExprPtr capacity;
	};
	struct NamedType
	{
		std::string name;
		std::vector<TypePtr> genericArgs;
	};
	struct UnionType
	{
		std::vector<TypePtr> members;
	};
	struct IntersectionType
	{
		std::vector<TypePtr> members;
	};
	struct FunctionType
	{
		std::vector<TypePtr> paramTypes;
		TypePtr returnType;
	};

	// Expression structures
	struct Literal
	{
		std::string value;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Identifier
	{
		std::string name;
		std::vector<std::string> genericArgs;
		std::vector<TypePtr> genericArgsNodes;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct BinaryOp
	{
		ExprPtr left;
		std::string op;
		ExprPtr right;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct UnaryOp
	{
		std::string op;
		ExprPtr operand;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Reference
	{
		ExprPtr operand;
		bool isMutable = false;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Deref
	{
		ExprPtr operand;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct FieldAccess
	{
		ExprPtr object;
		std::string fieldName;
		std::string objectInferredType;
		bool isNarrowedUnion = false;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Index
	{
		ExprPtr object;
		ExprPtr index;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Call
	{
		ExprPtr callee;
		std::vector<ExprPtr> args;
		bool calleeIsExtern = false;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct StructLiteral
	{
		std::string typeName;
		std::vector<ExprPtr> fields;
		std::vector<std::string> genericArgs;
		std::vector<TypePtr> genericArgsNodes;
		std::vector<std::string> fieldNames;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct ArrayLiteral
	{
		std::vector<ExprPtr> elements;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct If
	{
		ExprPtr condition;
		ExprPtr thenBranch;
		ExprPtr elseBranch;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct MatchArm
	{
		std::string pattern;
		ExprPtr body;
	};
	struct Match
	{
		ExprPtr scrutinee;
		std::vector<MatchArm> arms;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Is
	{
		ExprPtr value;
		TypePtr targetType;
		std::string targetTypeStr;
		std::string valueInferredType; // The union type of the value being checked
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct SizeOf
	{
		TypePtr typeNode;
		std::string typeStr;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct Block
	{
		std::vector<StmtPtr> statements;
		ExprPtr resultExpr;
		std::string inferredType;
		::ExprPtr exprType;
		int line = 0;
	};
	struct EnumValue
	{
		std::string enumName;
		std::string variant;
		::ExprPtr exprType;
		int line = 0;
	};

	// Statement structures
	struct Let
	{
		std::string name;
		bool isMutable = false;
		TypePtr typeAnnotation;
		ExprPtr initializer;
		int line = 0;
	};
	struct Assignment
	{
		ExprPtr target;
		ExprPtr value;
		int line = 0;
	};
	struct IfStmt
	{
		ExprPtr condition;
		ExprPtr thenBranch;
		ExprPtr elseBranch;
		int line = 0;
	};
	struct While
	{
		ExprPtr condition;
		ExprPtr body;
		int line = 0;
	};
	struct Loop
	{
		ExprPtr body;
		int line = 0;
	};
	struct Break
	{
		int line = 0;
	};
	struct Continue
	{
		int line = 0;
	};
	struct Return
	{
		ExprPtr value;
		int line = 0;
	};
	struct ExprStmt
	{
		ExprPtr expr;
		int line = 0;
	};

	// Declaration structures
	struct Parameter
	{
		std::string name;
		TypePtr type;
		bool isMutable = false;
	};
	struct StructField
	{
		std::string name;
		TypePtr type;
	};
	struct Function
	{
		std::string name;
		std::vector<Parameter> params;
		TypePtr returnType;
		std::vector<std::string> genericParams;
		std::vector<std::string> lifetimeParams;
		ExprPtr body;
		int line = 0;
	};
	struct Struct
	{
		std::string name;
		std::vector<StructField> fields;
		std::vector<std::string> genericParams;
		int line = 0;
	};
	struct Enum
	{
		std::string name;
		std::vector<std::string> variants;
		int line = 0;
	};
	struct Expect
	{
		std::string name;
		std::vector<Parameter> params;
		TypePtr returnType;
		std::vector<std::string> genericParams;
		int line = 0;
	};
	struct Actual
	{
		std::string name;
		std::vector<Parameter> params;
		TypePtr returnType;
		std::vector<std::string> genericParams;
		ExprPtr body;
		int line = 0;
	};
	struct ExternFn
	{
		std::string name;
		std::vector<Parameter> params;
		TypePtr returnType;
		std::vector<std::string> genericParams;
		int line = 0;
	};
	struct TypeAlias
	{
		std::string name;
		std::vector<std::string> genericParams;
		TypePtr aliasedType;
		int line = 0;
	};
	struct Module
	{
		std::string name;
		std::vector<DeclPtr> declarations;
		int line = 0;
	};
	struct Use
	{
		std::string path;
		bool isExtern = false;
		int line = 0;
	};
	struct Program
	{
		std::vector<DeclPtr> declarations;
		std::vector<StmtPtr> statements;
	};

	// Pattern matching helper
	template <class... Ts>
	struct Overload : Ts...
	{
		using Ts::operator()...;
	};
	template <class... Ts>
	Overload(Ts...) -> Overload<Ts...>;

	// Helper functions
	inline int getLine(const Expr &e)
	{
		return std::visit([](const auto &x)
											{ return x.line; }, e);
	}
	inline ::ExprPtr getType(const Expr &e)
	{
		return std::visit([](const auto &x)
											{ return x.exprType; }, e);
	}
	inline void setType(Expr &e, ::ExprPtr t)
	{
		std::visit([&t](auto &x)
							 { x.exprType = t; }, e);
	}

} // namespace ast
