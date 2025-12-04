#pragma once
#include <string>
#include <memory>
#include <map>
#include <vector>
#include <set>
#include "ast/ast.h"
#include "ast/ast_typed.h"
#include "ast/ast_converter.h"

struct FileOutput
{
	std::string header;									// .h file content
	std::string implementation;					// .cpp file content
	std::set<std::string> dependencies; // Module names this file depends on (from 'use' statements)
};

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
	// Legacy method: generate single merged output
	std::string generate(std::shared_ptr<ASTNode> ast);

	// New per-file generation methods
	FileOutput generateFile(std::shared_ptr<ASTNode> ast, const std::string &moduleName);

	// Set whether this is a library (no main generation)
	void setIsLibrary(bool lib) { isLibrary = lib; }

	// Set whether to generate inline functions (for headers)
	void setGenerateInline(bool inline_) { generateInline = inline_; }

private:
	bool isLibrary = false;
	bool generateInline = false;

	// Per-file generation helpers
	std::string generateFileHeader(std::shared_ptr<ASTNode> ast, const std::string &moduleName);
	std::string generateFileImplementation(std::shared_ptr<ASTNode> ast, const std::string &moduleName);
	std::set<std::string> extractDependencies(std::shared_ptr<ASTNode> ast);
	bool shouldExport(std::shared_ptr<ASTNode> node);

	// Helpers
	static bool isFunctionPointerType(const std::string &type);
	static std::string formatFunctionPointerParam(const std::string &paramType, const std::string &paramName);

	std::string generateNode(std::shared_ptr<ASTNode> node);

	// Statement generation
	std::string generateIfStmt(std::shared_ptr<ASTNode> node);
	std::string generateWhileStmt(std::shared_ptr<ASTNode> node);
	std::string generateLoopStmt(std::shared_ptr<ASTNode> node);
	std::string generateBreakStmt(std::shared_ptr<ASTNode> node);
	std::string generateContinueStmt(std::shared_ptr<ASTNode> node);
	std::string generateLetStmt(std::shared_ptr<ASTNode> node);
	std::string generateAssignmentStmt(std::shared_ptr<ASTNode> node);
	std::string generateReturnStmt(std::shared_ptr<ASTNode> node);

	// Expression generation
	std::string generateBinaryOp(std::shared_ptr<ASTNode> node);
	std::string generateUnaryOp(std::shared_ptr<ASTNode> node);
	std::string generateCallExpr(std::shared_ptr<ASTNode> node);
	std::string generateIfExpr(std::shared_ptr<ASTNode> node);

	std::string generateFunctionBlock(std::shared_ptr<ASTNode> block, const std::string &returnType, bool isExpression = false);
	std::string generateModuleDecl(std::shared_ptr<ASTNode> node);
	std::string generateActualDecl(std::shared_ptr<ASTNode> node);
	std::string genActualForwardDecl(std::shared_ptr<ASTNode> node);
	std::string mapType(std::string tuffType);

	// Union type helpers
	bool isUnionType(const std::string &type);
	std::vector<std::string> splitUnionType(const std::string &unionType);
	std::string generateUnionStruct(const std::string &unionType, const std::vector<std::string> &typeParams = {});
	std::string getUnionStructName(const std::string &unionType);
	std::string getUnionTagName(const std::string &unionType);
	std::string wrapInUnion(const std::string &value, const std::string &valueType, const std::string &targetType);
	bool isGenericParam(const std::string &type);

	// Match expression codegen
	std::string generateMatchExpr(std::shared_ptr<ASTNode> node);

	// Name mangling for generic types
	std::string mangleName(const std::string &name);

	// C++ keyword escaping
	std::string escapeCppKeyword(const std::string &name);

	// Destructor tracking
	std::vector<ScopeCPP> scopes;
	std::string getDestructor(const std::string &type);
	bool nextBlockIsLoop = false;

	// Type alias expansion (e.g., "Option" -> "Some<T>|None<T>")
	std::map<std::string, std::string> typeAliasExpansions;
	std::string expandTypeAlias(const std::string &type);

	// ===== DEPENDENCY TRACKING FOR TOPOLOGICAL SORT =====
	// Extract type names that a given type depends on
	std::set<std::string> extractTypeDependencies(const std::string &typeStr);
	std::set<std::string> extractNodeDependencies(std::shared_ptr<ASTNode> node);

	// Topological sort of type declarations
	std::vector<std::shared_ptr<ASTNode>> topologicalSortTypes(
			const std::vector<std::shared_ptr<ASTNode>> &nodes);

	// Forward declarations generation
	std::string generateForwardDeclarations(
			const std::vector<std::shared_ptr<ASTNode>> &functions,
			const std::vector<std::shared_ptr<ASTNode>> &implDecls,
			const std::vector<std::shared_ptr<ASTNode>> &actualDecls);

	// ===== TYPED AST METHODS (using std::visit) =====
	// These use the new ast::Expr, ast::Stmt, and ast::Decl types
	std::string genExpr(ast::ExprPtr expr);
	std::string genStmt(ast::StmtPtr stmt);
	std::string genDecl(ast::DeclPtr decl);
	std::string genType(ast::TypePtr type);
	std::string genParamDecl(const ast::Parameter &param);
	std::string genFunctionBody(ast::ExprPtr body, ast::TypePtr returnType);
	std::string genFunctionForwardDecl(ast::DeclPtr decl);

	// Generate tagged union struct from TypePtr
	std::string generateUnionStructFromType(const std::string &aliasName, ast::TypePtr unionType, const std::vector<std::string> &genericParams);
};
