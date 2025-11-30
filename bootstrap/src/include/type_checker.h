#pragma once
#include <memory>
#include <map>
#include <string>
#include "ast.h"

struct SymbolInfo
{
	std::string type;
	bool isMutable;
};

class TypeChecker
{
private:
	std::map<std::string, SymbolInfo> symbolTable;

	bool isNumericType(const std::string &type)
	{
		return (type == "I32" || type == "I64" || type == "I8" || type == "I16" ||
						type == "U8" || type == "U16" || type == "U32" || type == "U64" ||
						type == "F32" || type == "F64");
	}

public:
	void check(std::shared_ptr<ASTNode> node);
};
