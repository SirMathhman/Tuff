package com.sirmathhman.detektrules

import io.gitlab.arturbosch.detekt.api.RuleSet
import io.gitlab.arturbosch.detekt.api.RuleSetProvider

class NoThrowRuleSetProvider : RuleSetProvider {
    override val ruleSetId: String = "custom-rules"

    override fun instance(config: io.gitlab.arturbosch.detekt.api.Config): RuleSet {
        return RuleSet(ruleSetId, listOf(
            NoThrowRule(config),
            FunctionLengthRule(config),
            NoAsRule(config)
        ))
    }
}
