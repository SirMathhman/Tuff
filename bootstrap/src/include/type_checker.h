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

class TypeChecker
{
private:
	std::map<std::string, SymbolInfo> symbolTable;
	std::map<std::string, StructInfo> structTable;

	bool isNumericType(const std::string &type)
	{
		return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
						type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
						type == "F32" || type == "F64");
	}

public:
	void check(std::shared_ptr<ASTNode> node);
};
