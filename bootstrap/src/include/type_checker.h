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
	bool isMutable;
};

struct StructInfo
{
	std::vector<std::pair<std::string, std::string>> fields; // (name, type) pairs
	std::vector<std::string> genericParams;									 // <T>
};

struct FunctionInfo
{
	std::string returnType;
	std::vector<std::pair<std::string, std::string>> params; // (name, type) pairs
	std::vector<std::string> genericParams;									 // <T, U>
	std::map<std::string, std::string> genericBounds;				 // T -> I32 (type bounds)
	std::vector<std::string> lifetimeParams;								 // <a, b>
};

struct EnumInfo
{
	std::vector<std::string> variants; // List of variant names
};

struct ExpectInfo
{
	std::string returnType;
	std::vector<std::pair<std::string, std::string>> params; // (name, type) pairs
};

struct TypeAliasInfo
{
	std::string aliasedType;
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
	std::map<std::string, std::string> narrowedTypes; // variable -> narrowed type (for union type narrowing)
	int currentScopeDepth = 0;
	std::string currentFunctionReturnType;				 // Track return type for validation
	std::string currentModule;										 // Track current module context
	std::string currentStruct;										 // Track current struct context (for this.field)
	std::vector<std::string> importedModules;			 // Track use declarations
	std::vector<std::string> genericParamsInScope; // Track generic params in current scope

	bool isNumericType(const std::string &type);

	void checkBinaryOp(std::shared_ptr<ASTNode> node);
	void checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node);
	void registerDeclarations(std::shared_ptr<ASTNode> node);
	void checkCallExpr(std::shared_ptr<ASTNode> node);
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

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::vector<std::string> splitUnionType(const std::string &unionType);
	bool isTypeCompatible(const std::string &valueType, const std::string &targetType);

	// Type alias helpers
	std::string expandTypeAlias(const std::string &type);

public:
	void check(std::shared_ptr<ASTNode> node);
};
