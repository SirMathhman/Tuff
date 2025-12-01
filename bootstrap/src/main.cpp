#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <filesystem>

#include "lexer.h"
#include "parser.h"
#include "type_checker.h"
#include "codegen_js.h"
#include "codegen_cpp.h"

std::string readFile(const std::string &path)
{
	std::ifstream file(path);
	if (!file.is_open())
	{
		std::cerr << "Could not open file: " << path << std::endl;
		exit(1);
	}
	std::stringstream buffer;
	buffer << file.rdbuf();
	return buffer.str();
}

void writeToFile(const std::string &path, const std::string &content)
{
	// Create parent directories
	std::filesystem::path filePath(path);
	if (filePath.has_parent_path())
	{
		std::filesystem::create_directories(filePath.parent_path());
	}

	std::ofstream file(path);
	if (!file.is_open())
	{
		std::cerr << "Could not write to file: " << path << std::endl;
		exit(1);
	}
	file << content;
	file.close();
}

std::vector<std::string> split(const std::string &str, char delimiter)
{
	std::vector<std::string> tokens;
	std::stringstream ss(str);
	std::string token;
	while (std::getline(ss, token, delimiter))
	{
		tokens.push_back(token);
	}
	return tokens;
}

int main(int argc, char *argv[])
{
	if (argc < 3)
	{
		std::cerr << "Usage: tuffc <source.tuff> <target> [-o <output>] [--sources <file1,file2,...>]" << std::endl;
		std::cerr << "Targets: js, cpp" << std::endl;
		std::cerr << "Options:" << std::endl;
		std::cerr << "  -o <output>           Write output to file instead of stdout" << std::endl;
		std::cerr << "  --sources <files>     Comma-separated list of source files to compile together" << std::endl;
		return 1;
	}

	std::string sourcePath = argv[1];
	std::string target = argv[2];
	std::string outputPath = "";
	std::vector<std::string> sourcePaths;
	sourcePaths.push_back(sourcePath);

	// Parse additional arguments
	for (int i = 3; i < argc; i++)
	{
		std::string arg = argv[i];
		if (arg == "-o" && i + 1 < argc)
		{
			outputPath = argv[++i];
		}
		else if (arg == "--sources" && i + 1 < argc)
		{
			std::string sourcesList = argv[++i];
			sourcePaths = split(sourcesList, ',');
		}
	}

	// Read and parse all source files
	std::vector<std::shared_ptr<ASTNode>> asts;

	for (const auto &path : sourcePaths)
	{
		std::string sourceCode = readFile(path);

		// 1. Lexing
		Lexer lexer(sourceCode);
		auto tokens = lexer.tokenize();

		// 2. Parsing
		Parser parser(tokens);
		auto ast = parser.parse();

		asts.push_back(ast);
	}

	// Merge ASTs (combine children from all source files)
	auto mergedAst = std::make_shared<ASTNode>();
	mergedAst->type = ASTNodeType::PROGRAM;

	for (const auto &ast : asts)
	{
		for (auto child : ast->children)
		{
			mergedAst->children.push_back(child);
		}
	}

	// 3. Type Checking
	TypeChecker checker;
	checker.check(mergedAst);

	// 4. Code Generation
	std::string output;
	if (target == "js")
	{
		CodeGeneratorJS codegen;
		output = codegen.generate(mergedAst);
	}
	else if (target == "cpp")
	{
		CodeGeneratorCPP codegen;

		// Use shared header when outputPath is specified
		if (!outputPath.empty())
		{
			codegen.setUseSharedHeader(true);

			// Generate shared header
			std::filesystem::path outPath(outputPath);
			std::filesystem::path headerPath = outPath.parent_path() / "tuff_decls.h";
			std::string headerContent = codegen.generateSharedHeader(mergedAst);
			writeToFile(headerPath.string(), headerContent);
		}

		output = codegen.generate(mergedAst);
	}
	else
	{
		std::cerr << "Unknown target: " << target << std::endl;
		return 1;
	}

	// Write output
	if (outputPath.empty())
	{
		std::cout << output;
	}
	else
	{
		writeToFile(outputPath, output);
		std::cerr << "Compiled to: " << outputPath << std::endl;
	}

	return 0;
}
