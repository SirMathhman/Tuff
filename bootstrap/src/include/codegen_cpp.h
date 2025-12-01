#pragma once
#include <string>
#include <memory>
#include "ast.h"

class CodeGeneratorCPP
{
public:
	std::string generate(std::shared_ptr<ASTNode> ast);

private:
	std::string generateNode(std::shared_ptr<ASTNode> node);
	std::string generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType);
	std::string mapType(std::string tuffType);

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::vector<std::string> splitUnionType(const std::string &unionType);
	std::string generateUnionStruct(const std::string &unionType);
	std::string getUnionStructName(const std::string &unionType);
	std::string wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType);
};
