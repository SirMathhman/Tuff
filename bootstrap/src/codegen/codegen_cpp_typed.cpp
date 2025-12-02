#include "codegen_cpp.h"
#include <sstream>

// ============================================================================
// TYPED CODE GENERATION - Uses std::visit for pattern matching
// ============================================================================
// This file contains the typed AST code generation methods.
// They use std::visit to dispatch on ast::Expr and ast::Stmt variants.
// ============================================================================

std::string CodeGeneratorCPP::genExpr(ast::ExprPtr expr)
{
	if (!expr)
		return "";

	return std::visit(ast::Overload{[this](const ast::Literal &e) -> std::string
																	{
																		// Strip type suffix from literals (e.g., "10I32" -> "10")
																		std::string literal = e.value;
																		std::string result;
																		for (char c : literal)
																		{
																			if ((c >= '0' && c <= '9') || c == '.' || c == '-')
																			{
																				result += c;
																			}
																			else
																			{
																				break;
																			}
																		}
																		return result.empty() ? literal : result;
																	},

																	[this](const ast::Identifier &e) -> std::string
																	{
																		// Note: generic args are NOT emitted here - they're handled at CALL_EXPR level
																		return escapeCppKeyword(e.name);
																	},

																	[this](const ast::BinaryOp &e) -> std::string
																	{
																		return genExpr(e.left) + " " + e.op + " " + genExpr(e.right);
																	},

																	[this](const ast::UnaryOp &e) -> std::string
																	{
																		return "(" + e.op + genExpr(e.operand) + ")";
																	},

																	[this](const ast::Reference &e) -> std::string
																	{
																		return "&" + genExpr(e.operand);
																	},

																	[this](const ast::Deref &e) -> std::string
																	{
																		return "*" + genExpr(e.operand);
																	},

																	[this](const ast::FieldAccess &e) -> std::string
																	{
																		auto object = genExpr(e.object);
																		// If accessing field on a narrowed union, unwrap it directly
																		if (e.isNarrowedUnion)
																		{
																			// Get the narrowed type (e.g., Some<I32>)
																			std::string narrowedType = e.objectInferredType;
																			// Extract base name (e.g., "Some" from "Some<I32>")
																			std::string baseName = narrowedType;
																			size_t pos = baseName.find('<');
																			if (pos != std::string::npos)
																			{
																				baseName = baseName.substr(0, pos);
																			}
																			return object + ".__val_" + baseName + "." + e.fieldName;
																		}
																		// Handle pointer access ->
																		if (e.objectInferredType.length() > 0 && e.objectInferredType[0] == '*')
																		{
																			return object + "->" + e.fieldName;
																		}
																		return object + "." + e.fieldName;
																	},

																	[this](const ast::Index &e) -> std::string
																	{
																		return genExpr(e.object) + "[" + genExpr(e.index) + "]";
																	},

																	[this](const ast::Call &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << genExpr(e.callee) << "(";
																		for (size_t i = 0; i < e.args.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genExpr(e.args[i]);
																		}
																		ss << ")";
																		return ss.str();
																	},

																	[this](const ast::StructLiteral &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << e.typeName;
																		if (!e.genericArgs.empty())
																		{
																			ss << "<";
																			for (size_t i = 0; i < e.genericArgs.size(); i++)
																			{
																				if (i > 0)
																					ss << ", ";
																				ss << mapType(e.genericArgs[i]);
																			}
																			ss << ">";
																		}
																		ss << "{ ";
																		for (size_t i = 0; i < e.fields.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genExpr(e.fields[i]);
																		}
																		ss << " }";
																		return ss.str();
																	},

																	[this](const ast::ArrayLiteral &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "{";
																		for (size_t i = 0; i < e.elements.size(); i++)
																		{
																			if (i > 0)
																				ss << ", ";
																			ss << genExpr(e.elements[i]);
																		}
																		ss << "}";
																		return ss.str();
																	},

																	[this](const ast::If &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "(" << genExpr(e.condition) << " ? ";
																		ss << genExpr(e.thenBranch) << " : ";
																		ss << genExpr(e.elseBranch) << ")";
																		return ss.str();
																	},

																	[this](const ast::Match &e) -> std::string
																	{
																		// Simplified - full match requires more context
																		std::stringstream ss;
																		ss << "/* match */ (";
																		for (size_t i = 0; i < e.arms.size(); i++)
																		{
																			if (i > 0)
																				ss << " : ";
																			ss << genExpr(e.arms[i].body);
																		}
																		ss << ")";
																		return ss.str();
																	},

																	[this](const ast::Is &e) -> std::string
																	{
																		// is operator: expr is Type → (expr.__tag == UnionStruct::Tag::Type)
																		auto exprCode = genExpr(e.value);
																		std::string unionType = e.valueInferredType;
																		std::string structName = getUnionStructName(unionType);

																		// Add template argument from union variants
																		auto variants = splitUnionType(unionType);
																		if (!variants.empty())
																		{
																			size_t start = variants[0].find('<');
																			if (start != std::string::npos)
																			{
																				size_t end = variants[0].find('>');
																				if (end != std::string::npos)
																				{
																					std::string param = variants[0].substr(start + 1, end - start - 1);
																					structName += "<" + mapType(param) + ">";
																				}
																			}
																		}

																		// Extract base name from target type (e.g., "Some" from "Some<I32>")
																		std::string baseName = e.targetTypeStr;
																		size_t pos = baseName.find('<');
																		if (pos != std::string::npos)
																		{
																			baseName = baseName.substr(0, pos);
																		}

																		return "(" + exprCode + ".__tag == " + structName + "::Tag::" + baseName + ")";
																	},

																	[this](const ast::SizeOf &e) -> std::string
																	{
																		return "sizeof(" + mapType(e.typeStr) + ")";
																	},

																	[this](const ast::Block &e) -> std::string
																	{
																		std::stringstream ss;
																		ss << "{\n";
																		for (const auto &stmt : e.statements)
																		{
																			ss << "  " << genStmt(stmt) << "\n";
																		}
																		if (e.resultExpr)
																		{
																			ss << "  return " << genExpr(e.resultExpr) << ";\n";
																		}
																		ss << "}";
																		return ss.str();
																	},

																	[this](const ast::EnumValue &e) -> std::string
																	{
																		return e.enumName + "::" + e.variant;
																	}},
										*expr);
}

std::string CodeGeneratorCPP::genStmt(ast::StmtPtr stmt)
{
	if (!stmt)
		return "";

	return std::visit(ast::Overload{[this](const ast::Let &s) -> std::string
																	{
																		std::stringstream ss;
																		ss << "auto ";
																		if (!s.isMutable)
																			ss << "const ";
																		ss << s.name;
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
																	{
																		return "while (" + genExpr(s.condition) + ") " + genExpr(s.body);
																	},

																	[this](const ast::Loop &s) -> std::string
																	{
																		return "while (true) " + genExpr(s.body);
																	},

																	[this](const ast::Break &) -> std::string
																	{
																		return "break;";
																	},

																	[this](const ast::Continue &) -> std::string
																	{
																		return "continue;";
																	},

																	[this](const ast::Return &s) -> std::string
																	{
																		if (s.value)
																		{
																			return "return " + genExpr(s.value) + ";";
																		}
																		return "return;";
																	},

																	[this](const ast::ExprStmt &s) -> std::string
																	{
																		return genExpr(s.expr) + ";";
																	}},
										*stmt);
}

std::string CodeGeneratorCPP::genDecl(ast::DeclPtr decl)
{
	if (!decl)
		return "";

	return std::visit(ast::Overload{
			[this](const ast::Function &d) -> std::string
			{
				std::stringstream ss;

				// Template params
				if (!d.genericParams.empty())
				{
					ss << "template<";
					for (size_t i = 0; i < d.genericParams.size(); i++)
					{
						if (i > 0) ss << ", ";
						ss << "typename " << d.genericParams[i];
					}
					ss << ">\n";
				}

				// Return type and name (rename main to tuff_main)
				std::string funcName = (d.name == "main") ? "tuff_main" : d.name;
				// Note: returnType would need proper handling - for now use inferredType
				ss << "/* return */ " << funcName << "(";

				// Parameters
				for (size_t i = 0; i < d.params.size(); i++)
				{
					if (i > 0) ss << ", ";
					ss << "/* type */ " << d.params[i].name;
				}

				ss << ") ";

				// Body
				if (d.body)
				{
					ss << genExpr(d.body);
				}

				return ss.str();
			},

			[this](const ast::Struct &d) -> std::string
			{
				std::stringstream ss;

				if (!d.genericParams.empty())
				{
					ss << "template<";
					for (size_t i = 0; i < d.genericParams.size(); i++)
					{
						if (i > 0) ss << ", ";
						ss << "typename " << d.genericParams[i];
					}
					ss << ">\n";
				}

				ss << "struct " << d.name << " {\n";
				for (const auto &field : d.fields)
				{
					ss << "    /* type */ " << field.name << ";\n";
				}
				ss << "};";
				return ss.str();
			},

			[this](const ast::Enum &d) -> std::string
			{
				std::stringstream ss;
				ss << "enum class " << d.name << " {\n";
				for (size_t i = 0; i < d.variants.size(); i++)
				{
					if (i > 0) ss << ",\n";
					ss << "    " << d.variants[i];
				}
				ss << "\n};";
				return ss.str();
			},

			[this](const ast::Expect &) -> std::string
			{
				// Expect declarations have no codegen
				return "";
			},

			[this](const ast::Actual &d) -> std::string
			{
				std::stringstream ss;

				if (!d.genericParams.empty())
				{
					ss << "template<";
					for (size_t i = 0; i < d.genericParams.size(); i++)
					{
						if (i > 0) ss << ", ";
						ss << "typename " << d.genericParams[i];
					}
					ss << ">\n";
				}

				ss << "/* return */ " << d.name << "(";
				for (size_t i = 0; i < d.params.size(); i++)
				{
					if (i > 0) ss << ", ";
					ss << "/* type */ " << d.params[i].name;
				}
				ss << ") ";

				if (d.body)
				{
					ss << genExpr(d.body);
				}

				return ss.str();
			},

			[this](const ast::ExternFn &d) -> std::string
			{
				std::stringstream ss;
				ss << "extern ";

				if (!d.genericParams.empty())
				{
					ss << "template<";
					for (size_t i = 0; i < d.genericParams.size(); i++)
					{
						if (i > 0) ss << ", ";
						ss << "typename " << d.genericParams[i];
					}
					ss << "> ";
				}

				ss << "/* return */ " << d.name << "(";
				for (size_t i = 0; i < d.params.size(); i++)
				{
					if (i > 0) ss << ", ";
					ss << "/* type */ " << d.params[i].name;
				}
				ss << ");";
				return ss.str();
			},

			[this](const ast::TypeAlias &d) -> std::string
			{
				std::stringstream ss;
				ss << "using " << d.name << " = /* aliased type */;";
				return ss.str();
			},

			[this](const ast::Module &d) -> std::string
			{
				std::stringstream ss;
				ss << "namespace " << d.name << " {\n";
				for (const auto &child : d.declarations)
				{
					ss << genDecl(child) << "\n";
				}
				ss << "}";
				return ss.str();
			},

			[this](const ast::Use &) -> std::string
			{
				// Use declarations have no codegen
				return "";
			}
		}, *decl);
}
