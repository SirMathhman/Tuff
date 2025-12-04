#pragma once
#include <variant>
#include "ast_node_types.h"

// =============================================================================
// THE VARIANT TYPE
// =============================================================================

using ASTNodeVariant = std::variant<
		// Declarations
		ProgramNode,
		FunctionDeclNode,
		StructDeclNode,
		EnumDeclNode,
		ImplDeclNode,
		TypeAliasNode,
		ModuleDeclNode,
		UseDeclNode,
		ExpectDeclNode,
		ActualDeclNode,
		ExternFnDeclNode,
		ExternTypeDeclNode,
		ExternUseDeclNode,
		// Statements
		LetStmtNode,
		InLetStmtNode,
		AssignmentStmtNode,
		IfStmtNode,
		WhileStmtNode,
		LoopStmtNode,
		BreakStmtNode,
		ContinueStmtNode,
		ReturnStmtNode,
		BlockNode,
		// Expressions
		IdentifierNode,
		LiteralNode,
		StringLiteralNode,
		CharLiteralNode,
		BinaryOpNode,
		UnaryOpNode,
		CallExprNode,
		FieldAccessNode,
		IndexExprNode,
		IfExprNode,
		StructLiteralNode,
		ArrayLiteralNode,
		ReferenceExprNode,
		DerefExprNode,
		IsExprNode,
		MatchExprNode,
		SizeofExprNode,
		CastExprNode,
		FunctionRefExprNode,
		// Types
		TypeNode,
		PointerTypeNode,
		ArrayTypeNode,
		FunctionPtrTypeNode,
		TypeParamDeclNode,
		LifetimeParamNode,
		EnumValueNode>;

// =============================================================================
// AST NODE TYPE ENUM
// =============================================================================

enum class ASTNodeType
{
	PROGRAM,
	FUNCTION_DECL,
	LET_STMT,
	ASSIGNMENT_STMT,
	IF_STMT,
	IF_EXPR,
	WHILE_STMT,
	LOOP_STMT,
	BREAK_STMT,
	CONTINUE_STMT,
	RETURN_STMT,
	BLOCK,
	STRUCT_DECL,
	STRUCT_LITERAL,
	ENUM_DECL,
	ENUM_VALUE,
	EXPECT_DECL,
	ACTUAL_DECL,
	EXTERN_FN_DECL,
	EXTERN_TYPE_DECL,
	EXTERN_USE_DECL,
	MODULE_DECL,
	USE_DECL,
	TYPE_ALIAS,
	IMPL_DECL,
	FIELD_ACCESS,
	CALL_EXPR,
	BINARY_OP,
	UNARY_OP,
	LITERAL,
	IDENTIFIER,
	TYPE,
	TYPE_PARAM_DECL,
	POINTER_TYPE,
	ARRAY_TYPE,
	REFERENCE_EXPR,
	DEREF_EXPR,
	ARRAY_LITERAL,
	STRING_LITERAL,
	CHAR_LITERAL,
	INDEX_EXPR,
	IS_EXPR,
	MATCH_EXPR,
	LIFETIME_PARAM,
	SIZEOF_EXPR,
	CAST_EXPR,
	FUNCTION_PTR_TYPE,
	FUNCTION_REF_EXPR,
	IN_LET_STMT
};

// =============================================================================
// HELPER: Get ASTNodeType from variant
// =============================================================================

inline ASTNodeType getNodeType(const ASTNodeVariant &v)
{
	return std::visit([](auto &&arg) -> ASTNodeType
										{
											using T = std::decay_t<decltype(arg)>;
											if constexpr (std::is_same_v<T, ProgramNode>) return ASTNodeType::PROGRAM;
											else if constexpr (std::is_same_v<T, FunctionDeclNode>) return ASTNodeType::FUNCTION_DECL;
											else if constexpr (std::is_same_v<T, StructDeclNode>) return ASTNodeType::STRUCT_DECL;
											else if constexpr (std::is_same_v<T, EnumDeclNode>) return ASTNodeType::ENUM_DECL;
											else if constexpr (std::is_same_v<T, ImplDeclNode>) return ASTNodeType::IMPL_DECL;
											else if constexpr (std::is_same_v<T, TypeAliasNode>) return ASTNodeType::TYPE_ALIAS;
											else if constexpr (std::is_same_v<T, ModuleDeclNode>) return ASTNodeType::MODULE_DECL;
											else if constexpr (std::is_same_v<T, UseDeclNode>) return ASTNodeType::USE_DECL;
											else if constexpr (std::is_same_v<T, ExpectDeclNode>) return ASTNodeType::EXPECT_DECL;
											else if constexpr (std::is_same_v<T, ActualDeclNode>) return ASTNodeType::ACTUAL_DECL;
											else if constexpr (std::is_same_v<T, ExternFnDeclNode>) return ASTNodeType::EXTERN_FN_DECL;
											else if constexpr (std::is_same_v<T, ExternTypeDeclNode>) return ASTNodeType::EXTERN_TYPE_DECL;
											else if constexpr (std::is_same_v<T, ExternUseDeclNode>) return ASTNodeType::EXTERN_USE_DECL;
											else if constexpr (std::is_same_v<T, LetStmtNode>) return ASTNodeType::LET_STMT;
											else if constexpr (std::is_same_v<T, InLetStmtNode>) return ASTNodeType::IN_LET_STMT;
											else if constexpr (std::is_same_v<T, AssignmentStmtNode>) return ASTNodeType::ASSIGNMENT_STMT;
											else if constexpr (std::is_same_v<T, IfStmtNode>) return ASTNodeType::IF_STMT;
											else if constexpr (std::is_same_v<T, WhileStmtNode>) return ASTNodeType::WHILE_STMT;
											else if constexpr (std::is_same_v<T, LoopStmtNode>) return ASTNodeType::LOOP_STMT;
											else if constexpr (std::is_same_v<T, BreakStmtNode>) return ASTNodeType::BREAK_STMT;
											else if constexpr (std::is_same_v<T, ContinueStmtNode>) return ASTNodeType::CONTINUE_STMT;
											else if constexpr (std::is_same_v<T, ReturnStmtNode>) return ASTNodeType::RETURN_STMT;
											else if constexpr (std::is_same_v<T, BlockNode>) return ASTNodeType::BLOCK;
											else if constexpr (std::is_same_v<T, IdentifierNode>) return ASTNodeType::IDENTIFIER;
											else if constexpr (std::is_same_v<T, LiteralNode>) return ASTNodeType::LITERAL;
											else if constexpr (std::is_same_v<T, StringLiteralNode>) return ASTNodeType::STRING_LITERAL;
											else if constexpr (std::is_same_v<T, CharLiteralNode>) return ASTNodeType::CHAR_LITERAL;
											else if constexpr (std::is_same_v<T, BinaryOpNode>) return ASTNodeType::BINARY_OP;
											else if constexpr (std::is_same_v<T, UnaryOpNode>) return ASTNodeType::UNARY_OP;
											else if constexpr (std::is_same_v<T, CallExprNode>) return ASTNodeType::CALL_EXPR;
											else if constexpr (std::is_same_v<T, FieldAccessNode>) return ASTNodeType::FIELD_ACCESS;
											else if constexpr (std::is_same_v<T, IndexExprNode>) return ASTNodeType::INDEX_EXPR;
											else if constexpr (std::is_same_v<T, IfExprNode>) return ASTNodeType::IF_EXPR;
											else if constexpr (std::is_same_v<T, StructLiteralNode>) return ASTNodeType::STRUCT_LITERAL;
											else if constexpr (std::is_same_v<T, ArrayLiteralNode>) return ASTNodeType::ARRAY_LITERAL;
											else if constexpr (std::is_same_v<T, ReferenceExprNode>) return ASTNodeType::REFERENCE_EXPR;
											else if constexpr (std::is_same_v<T, DerefExprNode>) return ASTNodeType::DEREF_EXPR;
											else if constexpr (std::is_same_v<T, IsExprNode>) return ASTNodeType::IS_EXPR;
											else if constexpr (std::is_same_v<T, MatchExprNode>) return ASTNodeType::MATCH_EXPR;
											else if constexpr (std::is_same_v<T, SizeofExprNode>) return ASTNodeType::SIZEOF_EXPR;
											else if constexpr (std::is_same_v<T, CastExprNode>) return ASTNodeType::CAST_EXPR;
											else if constexpr (std::is_same_v<T, FunctionRefExprNode>) return ASTNodeType::FUNCTION_REF_EXPR;
											else if constexpr (std::is_same_v<T, TypeNode>) return ASTNodeType::TYPE;
											else if constexpr (std::is_same_v<T, PointerTypeNode>) return ASTNodeType::POINTER_TYPE;
											else if constexpr (std::is_same_v<T, ArrayTypeNode>) return ASTNodeType::ARRAY_TYPE;
											else if constexpr (std::is_same_v<T, FunctionPtrTypeNode>) return ASTNodeType::FUNCTION_PTR_TYPE;
											else if constexpr (std::is_same_v<T, TypeParamDeclNode>) return ASTNodeType::TYPE_PARAM_DECL;
											else if constexpr (std::is_same_v<T, LifetimeParamNode>) return ASTNodeType::LIFETIME_PARAM;
											else if constexpr (std::is_same_v<T, EnumValueNode>) return ASTNodeType::ENUM_VALUE;
											else return ASTNodeType::PROGRAM;
										}, v);
}

// =============================================================================
// HELPER: Typed accessor templates
// =============================================================================

template <typename T>
inline T *getIf(ASTNodeVariant &v) { return std::get_if<T>(&v); }

template <typename T>
inline const T *getIf(const ASTNodeVariant &v) { return std::get_if<T>(&v); }

template <typename T>
inline T &get(ASTNodeVariant &v) { return std::get<T>(v); }

template <typename T>
inline const T &get(const ASTNodeVariant &v) { return std::get<T>(v); }

template <typename T>
inline bool holds(const ASTNodeVariant &v) { return std::holds_alternative<T>(v); }
