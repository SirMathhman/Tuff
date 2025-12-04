#pragma once
#include <memory>
#include <map>
#include <set>
#include <string>
#include <vector>
#include "ast.h"

struct SymbolInfo
{
	std::string type;
	ExprPtr exprType; // New: ExprPtr based type
	bool isMutable;
	int scopeDepth = 0; // 0 = global, 1+ = local
	int originScopeDepth = -1; // For pointers: scope depth of the variable they reference (-1 = unknown/safe)
	std::string originVariable; // For pointers: name of the variable they reference (empty = unknown/safe)
};

struct StructInfo
{
	std::vector<std::pair<std::string, std::string>> fields;		 // (name, type) pairs
	std::vector<std::pair<std::string, ExprPtr>> fieldTypesExpr; // New
	std::vector<std::string> genericParams;											 // <T>
	bool isOpaque = false;																			 // true for extern type (no fields, cannot be instantiated)
};

struct FunctionInfo
{
	std::string returnType;
	ExprPtr returnTypeExpr;																			 // New
	std::vector<std::pair<std::string, std::string>> params;		 // (name, type) pairs
	std::vector<std::pair<std::string, ExprPtr>> paramTypesExpr; // New
	std::vector<std::string> genericParams;											 // <T, U>
	std::map<std::string, std::string> genericBounds;						 // T -> I32 (type bounds)
	std::map<std::string, ExprPtr> genericBoundsExpr;						 // New
	std::vector<std::string> lifetimeParams;										 // <a, b>
	bool isExtern = false;																			 // true for extern fn declarations
};

struct EnumInfo
{
	std::vector<std::string> variants; // List of variant names
};

struct ExpectInfo
{
	std::string returnType;
	ExprPtr returnTypeExpr;																			 // New
	std::vector<std::pair<std::string, std::string>> params;		 // (name, type) pairs
	std::vector<std::pair<std::string, ExprPtr>> paramTypesExpr; // New
};

struct TypeAliasInfo
{
	std::string aliasedType;
	ExprPtr aliasedTypeExpr;													// New
	std::vector<std::string> genericParams;						// <T, U>
	std::map<std::string, std::string> genericBounds; // T -> USize (type bounds)
};

class TypeChecker
{
private:
	std::map<std::string, SymbolInfo> symbolTable;
	std::map<std::string, StructInfo> structTable;
	std::map<std::string, FunctionInfo> functionTable;
	std::map<std::string, EnumInfo> enumTable;
	std::map<std::string, ExpectInfo> expectTable;
	std::map<std::string, TypeAliasInfo> typeAliasTable;
	std::map<std::string, ExprPtr> narrowedTypes; // variable -> narrowed type (for union type narrowing)
	std::map<std::string, int> pointerOrigins; // variable -> origin scope depth (for dangling pointer detection)
	int currentScopeDepth = 0;
	int functionScopeDepth = 0; // Track the scope depth where function body starts
	std::string currentFunctionReturnType;				 // Track return type for validation
	ExprPtr currentFunctionReturnTypeExpr;				 // New
	std::string currentModule;										 // Track current module context
	std::string currentStruct;										 // Track current struct context (for this.field)
	std::vector<std::string> importedModules;			 // Track use declarations
	std::vector<std::string> genericParamsInScope; // Track generic params in current scope

	bool isNumericType(const std::string &type);
	bool isNumericType(ExprPtr type); // New
	bool isIntegerType(ExprPtr type); // New
	bool isFloatType(ExprPtr type);		// New
	bool isBoolType(ExprPtr type);		// New

	void checkBinaryOp(std::shared_ptr<ASTNode> node);
	void checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node);
	void registerDeclarations(std::shared_ptr<ASTNode> node);
	void registerImplDecl(std::shared_ptr<ASTNode> node);
	void checkImplBlock(std::shared_ptr<ASTNode> node);
	void checkCallExpr(std::shared_ptr<ASTNode> node);
	void handleMethodCall(std::shared_ptr<ASTNode> node);
	void checkStructLiteral(std::shared_ptr<ASTNode> node);
	void checkArrayLiteral(std::shared_ptr<ASTNode> node);
	void checkIndexExpr(std::shared_ptr<ASTNode> node);
	void checkReferenceExpr(std::shared_ptr<ASTNode> node);
	void checkDerefExpr(std::shared_ptr<ASTNode> node);

	// Expression checking helpers (in type_checker_expr.cpp)
	void checkIdentifier(std::shared_ptr<ASTNode> node);
	void checkIsExpr(std::shared_ptr<ASTNode> node);
	void checkMatchExpr(std::shared_ptr<ASTNode> node);
	void checkUnaryOp(std::shared_ptr<ASTNode> node);
	void checkIfExpr(std::shared_ptr<ASTNode> node);
	void checkSizeOfExpr(std::shared_ptr<ASTNode> node);
	void checkCastExpr(std::shared_ptr<ASTNode> node);

	// Statement checking helpers (in type_checker_stmt.cpp)
	void checkLetStmt(std::shared_ptr<ASTNode> node);
	void checkInLetStmt(std::shared_ptr<ASTNode> node);
	void checkAssignmentStmt(std::shared_ptr<ASTNode> node);
	void checkIfStmt(std::shared_ptr<ASTNode> node);
	void checkWhileStmt(std::shared_ptr<ASTNode> node);
	void checkLoopStmt(std::shared_ptr<ASTNode> node);
	void checkBlock(std::shared_ptr<ASTNode> node);
	void checkReturnStmt(std::shared_ptr<ASTNode> node);

	// Declaration checking helpers (in type_checker_decl.cpp)
	void checkFunctionDecl(std::shared_ptr<ASTNode> node);
	void checkModuleDecl(std::shared_ptr<ASTNode> node);
	void checkActualDecl(std::shared_ptr<ASTNode> node);

	// Ownership/lifetime helpers (in type_checker_ownership.cpp)
	bool isPointerType(const std::string &type);
	int getExprOriginScope(std::shared_ptr<ASTNode> node);
	void checkReturnLifetime(std::shared_ptr<ASTNode> node, std::shared_ptr<ASTNode> expr);

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::vector<std::string> splitUnionType(const std::string &unionType);
	bool isTypeCompatible(const std::string &valueType, const std::string &targetType);

	// Type alias helpers
	std::string expandTypeAlias(const std::string &type);
	ExprPtr expandTypeAlias(ExprPtr type); // New

	// Helper to convert AST type node to ExprPtr
	ExprPtr resolveType(std::shared_ptr<ASTNode> node);

	// New type compatibility check using ExprPtr
	bool isTypeCompatible(ExprPtr valueType, ExprPtr targetType);
	bool areTypesEqual(ExprPtr t1, ExprPtr t2);
	bool isAssignableTo(ExprPtr sourceType, ExprPtr targetType);															 // Comprehensive assignability check
	ExprPtr stripIntersection(ExprPtr type);																									 // Strip intersection (T & #free -> T)
	std::string exprTypeToString(ExprPtr type);																								 // Helper for error messages
	ExprPtr substituteType(ExprPtr type, const std::map<std::string, ExprPtr> &substitutions); // New

public:
	void check(std::shared_ptr<ASTNode> node);
};
