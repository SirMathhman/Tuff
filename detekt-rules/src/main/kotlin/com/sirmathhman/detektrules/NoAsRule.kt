package com.sirmathhman.detektrules

import io.gitlab.arturbosch.detekt.api.*
import org.jetbrains.kotlin.psi.KtBinaryExpression
import org.jetbrains.kotlin.psi.KtBinaryExpressionWithTypeRHS

class NoAsRule(config: Config = Config.empty) : Rule(config) {
    override val issue: Issue = Issue(
        id = "NoAs",
        severity = Severity.Defect,
        description = "Using 'as' cast is banned. Use safe casts or sealed 'when' patterns instead.",
        debt = Debt.TEN_MINS
    )

    override fun visitBinaryExpression(expression: KtBinaryExpression) {
        expression.operationReference?.text?.let { op ->
            if (op == "as") {
                report(CodeSmell(issue, Entity.from(expression), message = "Use of 'as' is banned; prefer safe cast 'as?' or pattern matching"))
            }
        }
        super.visitBinaryExpression(expression)
    }
}
