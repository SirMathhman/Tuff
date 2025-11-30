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
	OwnershipState ownership = OwnershipState::Owned;
};

struct BorrowInfo
{
	std::string borrower; // Name of variable holding the borrow
	bool isMutable;				// true for &mut, false for &
	int scopeDepth;				// Scope level where borrow was created
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

class TypeChecker
{
private:
	std::map<std::string, SymbolInfo> symbolTable;
	std::map<std::string, StructInfo> structTable;
	std::map<std::string, FunctionInfo> functionTable;
	std::map<std::string, EnumInfo> enumTable;
	std::map<std::string, ExpectInfo> expectTable;
	std::map<std::string, std::vector<BorrowInfo>> activeBorrows; // variable -> active borrows
	int currentScopeDepth = 0;
	std::string currentFunctionReturnType;					// Track return type for validation
	std::string currentModule;											// Track current module context
	std::vector<std::string> importedModules;				// Track use declarations
	std::vector<std::string> genericParamsInScope;	// Track generic params in current scope
	std::vector<std::string> lifetimeParamsInScope; // Track lifetime params in current scope

	bool isNumericType(const std::string &type)
	{
		return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
						type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
						type == "F32" || type == "F64");
	}

	bool isCopyType(const std::string &type)
	{
		return isNumericType(type) || type == "Bool";
	}

	void checkBinaryOp(std::shared_ptr<ASTNode> node);
	void checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node);
	void registerDeclarations(std::shared_ptr<ASTNode> node);
	void checkCallExpr(std::shared_ptr<ASTNode> node);
	void checkStructLiteral(std::shared_ptr<ASTNode> node);
	void checkArrayLiteral(std::shared_ptr<ASTNode> node);
	void checkIndexExpr(std::shared_ptr<ASTNode> node);
	void checkReferenceExpr(std::shared_ptr<ASTNode> node);
	void checkDerefExpr(std::shared_ptr<ASTNode> node);

	// Ownership and borrow checking
	void addBorrow(const std::string &variable, const std::string &borrower, bool isMutable);
	void releaseBorrowsAtScope(int depth);
	void checkBorrowConflicts(const std::string &variable, bool wantMutable);
	void checkNotMoved(const std::string &variable);
	void moveVariable(const std::string &variable);
	std::string applyLifetimeElision(std::shared_ptr<ASTNode> funcNode);

	// Type comparison with lifetime substitution
	std::string stripLifetime(const std::string &type);
	bool typesMatch(const std::string &actual, const std::string &expected,
									const std::vector<std::string> &lifetimeParams);

public:
	void check(std::shared_ptr<ASTNode> node);
};
