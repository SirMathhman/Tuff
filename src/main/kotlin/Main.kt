import com.tuff.EvalError
import com.tuff.evaluate
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    val input = if (args.isNotEmpty()) args.joinToString(" ") else readlnOrNull() ?: ""

    evaluate(input)
        .onSuccess { println(it) }
        .onFailure { error ->
            println(error.message)
            exitProcess(1)
        }
}
