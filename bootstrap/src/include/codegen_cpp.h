#pragma once
#include <string>
#include <memory>
#include <map>
#include <vector>
#include "ast.h"

struct VarInfoCPP
{
	std::string name;
	std::string destructor;
};

struct ScopeCPP
{
	std::vector<VarInfoCPP> vars;
	bool isLoop = false;
};

class CodeGeneratorCPP
{
public:
	std::string generate(std::shared_ptr<ASTNode> ast);
	std::string generateSharedHeader(std::shared_ptr<ASTNode> ast);

	// Set whether to use shared header (default: false for backward compat)
	void setUseSharedHeader(bool use) { useSharedHeader = use; }

	// Set whether this is a library (no main generation)
	void setIsLibrary(bool lib) { isLibrary = lib; }

private:
	bool useSharedHeader = false;
	bool isLibrary = false;
	std::string generateNode(std::shared_ptr<ASTNode> node);
	std::string generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType);
	std::string generateModuleDecl(std::shared_ptr<ASTNode> node);
	std::string generateActualDecl(std::shared_ptr<ASTNode> node);
	std::string mapType(std::string tuffType);

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::vector<std::string> splitUnionType(const std::string &unionType);
	std::string generateUnionStruct(const std::string &unionType);
	std::string getUnionStructName(const std::string &unionType);
	std::string wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType);
	bool isGenericParam(const std::string &type);

	// Name mangling for generic types
	std::string mangleName(const std::string &name);

	// C++ keyword escaping
	std::string escapeCppKeyword(const std::string &name);

	// Intersection type helpers
	bool isIntersectionType(const std::string &type);
	std::vector<std::string> splitIntersectionType(const std::string &intersectionType);
	std::string getIntersectionStructName(const std::string &intersectionType);
	std::string generateIntersectionStruct(
			const std::string &intersectionType,
			const std::map<std::string, std::vector<std::pair<std::string, std::string>>> &structFields);

	// Destructor tracking
	std::vector<ScopeCPP> scopes;
	std::string getDestructor(const std::string &type);
	bool nextBlockIsLoop = false;
};
