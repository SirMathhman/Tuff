#pragma once
#include <string>
#include <memory>
#include <map>
#include <vector>
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

	// Intersection type helpers
	bool isIntersectionType(const std::string &type);
	std::vector<std::string> splitIntersectionType(const std::string &intersectionType);
	std::string getIntersectionStructName(const std::string &intersectionType);
	std::string generateIntersectionStruct(
		const std::string &intersectionType,
		const std::map<std::string, std::vector<std::pair<std::string, std::string>>> &structFields);
};
