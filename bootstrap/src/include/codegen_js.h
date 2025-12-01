#pragma once
#include <string>
#include <memory>
#include "ast.h"

class CodeGeneratorJS
{
public:
	std::string generate(std::shared_ptr<ASTNode> ast);

private:
	std::string generateNode(std::shared_ptr<ASTNode> node);
	std::string generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType);
	std::string generateModuleDecl(std::shared_ptr<ASTNode> node);
	std::string generateActualDecl(std::shared_ptr<ASTNode> node);

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::string wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType);
};
