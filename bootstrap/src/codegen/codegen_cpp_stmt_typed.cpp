#include "codegen_cpp.h"
#include <sstream>

std::string CodeGeneratorCPP::genStmt(ast::StmtPtr stmt)
{
	if (!stmt)
		return "";

	return std::visit(ast::Overload{[this](const ast::Let &s) -> std::string
																	{
																		std::stringstream ss;
																		// Use type annotation if present, otherwise auto
																		if (s.typeAnnotation)
																			ss << genType(s.typeAnnotation);
																		else
																			ss << "auto";
																		if (!s.isMutable)
																			ss << " const";
																		ss << " " << escapeCppKeyword(s.name);
																		if (s.initializer)
																		{
																			ss << " = " << genExpr(s.initializer);
																		}
																		ss << ";";
																		return ss.str();
																	},

																	[this](const ast::Assignment &s) -> std::string
																	{
																		return genExpr(s.target) + " = " + genExpr(s.value) + ";";
																	},

																	[this](const ast::IfStmt &s) -> std::string
																	{
																		std::stringstream ss;
																		ss << "if (" << genExpr(s.condition) << ") ";
																		ss << genExpr(s.thenBranch);
																		if (s.elseBranch)
																		{
																			ss << " else " << genExpr(s.elseBranch);
																		}
																		return ss.str();
																	},

																	[this](const ast::While &s) -> std::string
																	{ return "while (" + genExpr(s.condition) + ") " + genExpr(s.body); },

																	[this](const ast::Loop &s) -> std::string
																	{ return "while (true) " + genExpr(s.body); },

																	[this](const ast::Break &) -> std::string
																	{ return "break;"; },

																	[this](const ast::Continue &) -> std::string
																	{ return "continue;"; },

																	[this](const ast::Return &s) -> std::string
																	{ return s.value ? "return " + genExpr(s.value) + ";" : "return;"; },

																	[this](const ast::ExprStmt &s) -> std::string
																	{ return genExpr(s.expr) + ";"; }},
										*stmt);
}

std::string CodeGeneratorCPP::genParamDecl(const ast::Parameter &param)
{
	std::string typeStr = genType(param.type);
	std::string paramName = escapeCppKeyword(param.name);

	// Handle function pointer types: need to inject name after (*): RetType (*name)(Params)
	size_t funcPtrPos = typeStr.find(" (*)(");
	if (funcPtrPos != std::string::npos)
	{
		// Insert parameter name after the *: "RetType (*name)(Params)"
		std::string before = typeStr.substr(0, funcPtrPos + 3); // Include " (*"
		std::string after = typeStr.substr(funcPtrPos + 3);			// Everything after "(*" (includes ")(..."
		return before + paramName + after;
	}

	// Handle C++ array parameter syntax: int32_t arr[10] instead of int32_t[10] arr
	size_t bracketPos = typeStr.find('[');
	if (bracketPos != std::string::npos)
	{
		std::string baseType = typeStr.substr(0, bracketPos);
		std::string arraySuffix = typeStr.substr(bracketPos);
		return baseType + " " + paramName + arraySuffix;
	}

	return typeStr + " " + paramName;
}

std::string CodeGeneratorCPP::genFunctionBody(ast::ExprPtr body, ast::TypePtr returnType)
{
	if (!body)
		return "{}";

	// Check if body is a Block
	if (auto *block = std::get_if<ast::Block>(&*body))
	{
		std::stringstream ss;
		ss << "{\n";

		// Push new scope
		ScopeCPP newScope;
		newScope.isLoop = nextBlockIsLoop;
		nextBlockIsLoop = false;
		scopes.push_back(newScope);

		// Determine if we need implicit return
		std::string retType = genType(returnType);
		bool needsImplicitReturn = !retType.empty() && retType != "void";

		for (size_t i = 0; i < block->statements.size(); i++)
		{
			ss << "  " << genStmt(block->statements[i]) << "\n";
		}

		// Handle result expression (implicit return)
		if (block->resultExpr)
		{
			// Inject destructor calls before return
			ScopeCPP &currentScope = scopes.back();
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
			ss << "  return " << genExpr(block->resultExpr) << ";\n";
		}
		else
		{
			// No result expr - inject destructors at end
			ScopeCPP &currentScope = scopes.back();
			for (auto it = currentScope.vars.rbegin(); it != currentScope.vars.rend(); ++it)
			{
				ss << "  " << it->destructor << "(" << it->name << ");\n";
			}
		}

		scopes.pop_back();
		ss << "}";
		return ss.str();
	}

	// Single expression body - wrap in braces with return
	std::string retType = genType(returnType);
	if (retType != "void")
	{
		return "{ return " + genExpr(body) + "; }";
	}
	return "{ " + genExpr(body) + "; }";
}
