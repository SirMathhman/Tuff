#pragma once
#include <memory>
#include <map>
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
};

struct FunctionInfo
{
	std::string returnType;
	std::vector<std::pair<std::string, std::string>> params; // (name, type) pairs
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
	std::string currentFunctionReturnType;		// Track return type for validation
	std::string currentModule;								// Track current module context
	std::vector<std::string> importedModules; // Track use declarations

	bool isNumericType(const std::string &type)
	{
		return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
						type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
						type == "F32" || type == "F64");
	}

	void checkBinaryOp(std::shared_ptr<ASTNode> node);
	void checkFieldOrEnumAccess(std::shared_ptr<ASTNode> node);
	void registerDeclarations(std::shared_ptr<ASTNode> node);
	void checkCallExpr(std::shared_ptr<ASTNode> node);

public:
	void check(std::shared_ptr<ASTNode> node);
};
