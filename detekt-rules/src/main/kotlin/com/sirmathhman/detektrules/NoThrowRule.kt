package com.sirmathhman.detektrules

import io.gitlab.arturbosch.detekt.api.*
import org.jetbrains.kotlin.psi.KtThrowExpression

class NoThrowRule(config: Config = Config.empty) : Rule(config) {
    override val issue: Issue = Issue(
        id = "NoThrow",
        severity = Severity.Defect,
        description = "Using 'throw' is banned. Use Result<T, E> instead.",
        debt = Debt.FIVE_MINS
    )

    override fun visitThrowExpression(expression: KtThrowExpression) {
        report(
            CodeSmell(
                issue,
                Entity.from(expression),
                message = "Found 'throw' expression; use Result<T, E> instead"
            )
        )
        super.visitThrowExpression(expression)
    }
}
