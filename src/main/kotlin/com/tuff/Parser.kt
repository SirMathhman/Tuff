package com.tuff

fun parse(tokens: List<Token>): Result<Ast> {
    val parser = ParserImpl(tokens)
    return try {
        val ast = parser.parseSequence()
        if (!parser.isAtEnd) {
            Result.failure(EvalError.UnexpectedToken(parser.position, tokens[parser.position].toString()))
        } else {
            Result.success(ast)
        }
    } catch (e: EvalError) {
        Result.failure(e)
    }
}

private class ParserImpl(private val tokens: List<Token>) {
    private var pos = 0

    val position: Int get() = pos
    val isAtEnd: Boolean get() = pos >= tokens.size

    private fun peek(): Token? = tokens.getOrNull(pos)
    private fun advance(): Token = tokens[pos++]

    /**
     * Parses a sequence of zero or more statements followed by an optional result expression.
     * If statements are present, returns [Ast.Block]; otherwise returns the bare expression.
     */
    fun parseSequence(): Ast {
        val stmts = mutableListOf<Ast>()
        while (true) {
            val next = peek() ?: break
            when {
                next is Token.Let -> stmts.add(parseLet())
                next is Token.Identifier && isAssignment() -> stmts.add(parseAssign())
                next is Token.Star && isDerefAssignment() -> stmts.add(parseDerefAssign())
                next is Token.LBrace && isBlockStatement() -> stmts.add(parseBlock())
                else -> break
            }
        }
        val result = if (isAtEnd || peek() is Token.RBrace || peek() is Token.RParen) null
        else parseExpression()
        return if (stmts.isEmpty()) {
            result ?: throw EvalError.UnexpectedToken(pos, "<end>")
        } else {
            Ast.Block(stmts, result)
        }
    }

    /** Parses a braced block `{ ... }` as a statement. */
    private fun parseBlock(): Ast {
        advance() // consume '{'
        val ast = parseSequence()
        expect(Token.RBrace)
        return ast
    }

    fun parseExpression(): Ast {
        var left = parseTerm()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Op && (token.kind == OpKind.PLUS || token.kind == OpKind.MINUS || token.kind == OpKind.OR || token.kind == OpKind.EQ)) {
                advance()
                val right = parseTerm()
                left = Ast.BinaryOp(token.kind, left, right)
            } else {
                break
            }
        }
        return left
    }

    private fun parseTerm(): Ast {
        var left = parseFactor()
        while (true) {
            val token = peek() ?: break
            if (token is Token.Star) {
                // '*' as infix multiplication
                advance()
                val right = parseFactor()
                left = Ast.BinaryOp(OpKind.MULTIPLY, left, right)
            } else {
                break
            }
        }
        return left
    }

    private fun parseFactor(): Ast {
        if (isAtEnd) throw EvalError.UnexpectedToken(pos, "<end>")
        return when (val token = advance()) {
            is Token.Number -> Ast.Number(token.value)
            is Token.LParen -> {
                val ast = parseExpression()
                expect(Token.RParen)
                ast
            }

            is Token.LBrace -> {
                val ast = parseSequence()
                expect(Token.RBrace)
                ast
            }

            is Token.Ref -> {
                val mutable = if (peek() is Token.Mut) {
                    advance(); true
                } else {
                    false
                }
                val ident = advance() as? Token.Identifier
                    ?: throw EvalError.UnexpectedToken(pos - 1, token.toString())
                Ast.Ref(ident.name, mutable)
            }

            is Token.Star -> {
                // '*' as prefix dereference
                val inner = parseFactor()
                Ast.Deref(inner)
            }

            is Token.Identifier -> Ast.VarRef(token.name)
            is Token.Op, is Token.RParen, is Token.RBrace, is Token.Let, is Token.Mut, is Token.Equals, is Token.Semicolon ->
                throw EvalError.UnexpectedToken(pos - 1, token.toString())
        }
    }

    private fun parseLet(): Ast {
        advance() // consume 'let'
        val mutable = if (peek() is Token.Mut) {
            advance(); true
        } else {
            false
        }
        val ident = advance() as? Token.Identifier
            ?: throw EvalError.UnexpectedToken(pos - 1, "expected identifier after 'let'")
        expect(Token.Equals)
        val value = parseExpression()
        expect(Token.Semicolon)
        return Ast.Let(ident.name, value, mutable)
    }

    private fun parseAssign(): Ast {
        val ident = advance() as Token.Identifier
        advance() // consume '='
        val value = parseExpression()
        expect(Token.Semicolon)
        return Ast.Assign(ident.name, value)
    }

    private fun parseDerefAssign(): Ast {
        advance() // consume '*'
        val ref = parseFactor()
        advance() // consume '='
        val value = parseExpression()
        expect(Token.Semicolon)
        return Ast.DerefAssign(ref, value)
    }

    /** Checks if the current position starts an assignment: IDENT '=' */
    private fun isAssignment(): Boolean {
        val saved = pos
        advance() // consume identifier
        val result = peek() is Token.Equals
        pos = saved
        return result
    }

    /** Checks if the current position starts a deref assignment: '*' factor '=' */
    private fun isDerefAssignment(): Boolean {
        val saved = pos
        advance() // consume '*'
        parseFactor()
        val result = peek() is Token.Equals
        pos = saved
        return result
    }

    /**
     * Checks if the braced block at the current position is a block *statement*
     * rather than a grouping expression. A block is a statement if it contains
     * at least one statement AND is not followed by an operator (which would
     * make it part of a larger expression like `{ ... } * 4`).
     */
    private fun isBlockStatement(): Boolean {
        val saved = pos
        advance() // consume '{'
        // Check if it contains statements
        val hasStmts = when (val next = peek()) {
            is Token.Let -> true
            is Token.Identifier -> isAssignment()
            is Token.Star -> isDerefAssignment()
            is Token.LBrace -> isBlockStatement()
            else -> false
        }
        if (!hasStmts) {
            pos = saved
            return false
        }
        // Find the matching '}' and check what follows
        findMatchingRBrace()
        val after = peek()
        val isExprContinuation = after is Token.Star ||
                (after is Token.Op && (after.kind == OpKind.PLUS || after.kind == OpKind.MINUS || after.kind == OpKind.OR || after.kind == OpKind.EQ))
        pos = saved
        return !isExprContinuation
    }

    /** Advances [pos] to just past the '}' matching the '{' already consumed. */
    private fun findMatchingRBrace() {
        var depth = 1
        while (!isAtEnd) {
            val token = advance()
            if (token is Token.LBrace) depth++
            else if (token is Token.RBrace) {
                depth--
                if (depth == 0) return
            }
        }
        throw EvalError.UnexpectedToken(pos, "<end>")
    }

    private fun expect(expected: Token) {
        if (isAtEnd) throw EvalError.UnexpectedToken(pos, "<end>")
        val token = advance()
        if (token != expected) {
            throw EvalError.UnexpectedToken(pos - 1, token.toString())
        }
    }
}
