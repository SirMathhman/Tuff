package com.sirmathhman.detektrules

import io.gitlab.arturbosch.detekt.api.*
import org.jetbrains.kotlin.psi.KtNamedFunction

class FunctionLengthRule(config: Config = Config.empty) : Rule(config) {
    override val issue: Issue = Issue(
        id = "FunctionLength",
        severity = Severity.Style,
        description = "Functions should be no longer than the configured maximum number of lines.",
        debt = Debt.TEN_MINS
    )

    private val maxLines: Int = valueOrDefault("maxLines", 50)

    override fun visitNamedFunction(function: KtNamedFunction) {
        val text = function.text ?: return
        val lines = text.lines().size
        if (lines > maxLines) {
            report(
                CodeSmell(
                    issue,
                    Entity.from(function),
                    message = "Function '${function.name ?: "<anonymous>"}' has $lines lines (max $maxLines)"
                )
            )
        }
        super.visitNamedFunction(function)
    }
}
