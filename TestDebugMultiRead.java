import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;

public class TestDebugMultiRead {
	public static void main(String[] args) {
		String source = "fn sumPairs() => { let x = read I32; let y = read I32; if (x <= 0) 0 else x + y + sumPairs() }; sumPairs()";
		Result<Instruction[], Object> result = App.compile(source);

		if (result instanceof Result.Ok) {
			Result.Ok<Instruction[], Object> ok = (Result.Ok<Instruction[], Object>) result;
			System.out.println("Instructions:");
			System.out.println(Instruction.displayAll(ok.value()));
		} else {
			System.out.println("Compilation failed");
			System.out.println(result);
		}
	}
}
