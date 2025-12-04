#pragma once
#include <string>
#include <vector>
#include <memory>
#include "expr.h"
#include "type_env.h"

// Forward declarations
struct ASTNode;
using ASTNodePtr = std::shared_ptr<ASTNode>;

// =============================================================================
// DECLARATIONS
// =============================================================================

struct ProgramNode
{
	std::vector<ASTNodePtr> declarations;
};

struct FunctionDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> params;
	ASTNodePtr body;
	ASTNodePtr returnTypeNode;
	std::vector<ASTNodePtr> genericParams;
	std::vector<std::string> lifetimeParams;
	bool isExported = false;
};

struct StructDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> fields;
	std::vector<ASTNodePtr> genericParams;
	bool isOpaque = false;
	bool isExported = false;
};

struct EnumDeclNode
{
	std::string name;
	std::vector<std::string> variants;
	bool isExported = false;
};

struct ImplDeclNode
{
	std::string targetType;
	std::vector<ASTNodePtr> methods;
	std::vector<ASTNodePtr> genericParams;
};

struct TypeAliasNode
{
	std::string name;
	ASTNodePtr aliasedType;
	std::vector<ASTNodePtr> genericParams;
	bool isExported = false;
};

struct ModuleDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> declarations;
};

struct UseDeclNode
{
	std::string path;
};

struct ExpectDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> params;
	ASTNodePtr returnTypeNode;
	std::vector<ASTNodePtr> genericParams;
};

struct ActualDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> params;
	ASTNodePtr body;
	ASTNodePtr returnTypeNode;
	std::vector<ASTNodePtr> genericParams;
};

struct ExternFnDeclNode
{
	std::string name;
	std::vector<ASTNodePtr> params;
	ASTNodePtr returnTypeNode;
	std::vector<ASTNodePtr> genericParams;
};

struct ExternTypeDeclNode
{
	std::string name;
};

struct ExternUseDeclNode
{
	std::string moduleName;
};

// =============================================================================
// STATEMENTS
// =============================================================================

struct LetStmtNode
{
	std::string name;
	ASTNodePtr typeAnnotation;
	ASTNodePtr initializer;
	bool isMutable = false;
	bool isExported = false;
};

struct InLetStmtNode
{
	std::string name;
	ASTNodePtr typeAnnotation;
};

struct AssignmentStmtNode
{
	ASTNodePtr target;
	ASTNodePtr value;
};

struct IfStmtNode
{
	ASTNodePtr condition;
	ASTNodePtr thenBranch;
	ASTNodePtr elseBranch;
};

struct WhileStmtNode
{
	ASTNodePtr condition;
	ASTNodePtr body;
};

struct LoopStmtNode
{
	ASTNodePtr body;
};

struct BreakStmtNode
{
};

struct ContinueStmtNode
{
};

struct ReturnStmtNode
{
	ASTNodePtr value;
};

struct BlockNode
{
	std::vector<ASTNodePtr> statements;
};

// =============================================================================
// EXPRESSIONS
// =============================================================================

struct IdentifierNode
{
	std::string name;
};

struct LiteralNode
{
	std::string value;
	std::string literalType;
};

struct StringLiteralNode
{
	std::string value;
};

struct CharLiteralNode
{
	char value;
};

struct BinaryOpNode
{
	std::string op;
	ASTNodePtr left;
	ASTNodePtr right;
};

struct UnaryOpNode
{
	std::string op;
	ASTNodePtr operand;
};

struct CallExprNode
{
	ASTNodePtr callee;
	std::vector<ASTNodePtr> args;
	std::vector<std::string> genericArgs;
	std::vector<ASTNodePtr> genericArgsNodes;
	bool calleeIsExtern = false;
};

struct FieldAccessNode
{
	ASTNodePtr object;
	std::string fieldName;
};

struct IndexExprNode
{
	ASTNodePtr array;
	ASTNodePtr index;
};

struct IfExprNode
{
	ASTNodePtr condition;
	ASTNodePtr thenExpr;
	ASTNodePtr elseExpr;
};

struct StructLiteralNode
{
	std::string typeName;
	std::vector<ASTNodePtr> fieldValues;
	std::vector<std::string> fieldNames;
	std::vector<std::string> genericArgs;
	std::vector<ASTNodePtr> genericArgsNodes;
};

struct ArrayLiteralNode
{
	std::vector<ASTNodePtr> elements;
};

struct ReferenceExprNode
{
	ASTNodePtr operand;
	bool isMutable = false;
};

struct DerefExprNode
{
	ASTNodePtr operand;
};

struct IsExprNode
{
	ASTNodePtr expr;
	ASTNodePtr typeToCheck;
};

struct MatchExprNode
{
	ASTNodePtr expr;
	std::vector<ASTNodePtr> arms;
};

struct SizeofExprNode
{
	ASTNodePtr typeArg;
};

struct CastExprNode
{
	ASTNodePtr expr;
	ASTNodePtr targetType;
};

struct FunctionRefExprNode
{
	std::string functionName;
};

// =============================================================================
// TYPE NODES
// =============================================================================

struct TypeNode
{
	std::string name;
	std::vector<ASTNodePtr> genericArgs;
	std::string typeBound;
	ASTNodePtr typeBoundNode;
};

struct PointerTypeNode
{
	ASTNodePtr pointeeType;
	bool isMutable = false;
	std::string lifetime;
};

struct ArrayTypeNode
{
	ASTNodePtr elementType;
	ASTNodePtr initCount;
	ASTNodePtr capacity;
};

struct FunctionPtrTypeNode
{
	std::vector<ASTNodePtr> paramTypes;
	ASTNodePtr returnType;
};

struct TypeParamDeclNode
{
	std::string name;
	std::string bound;
	ASTNodePtr boundNode;
};

struct LifetimeParamNode
{
	std::string name;
};

struct EnumValueNode
{
	std::string enumName;
	std::string variantName;
};
