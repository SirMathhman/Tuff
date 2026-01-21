import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.TraceRunner;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.Arrays;

public class TestDebugMultiRead {
	public static void main(String[] args) {
		String source = "fn sumPairs() => { let x = read I32; let y = read I32; if (x <= 0) 0 else x + y + sumPairs() }; sumPairs()";
		Result<Instruction[], Object> result = App.compile(source);

		if (result instanceof Result.Ok) {
			Result.Ok<Instruction[], Object> ok = (Result.Ok<Instruction[], Object>) result;
			System.out.println("Instructions:");
			System.out.println(Instruction.displayAll(ok.value()));

			int[] input = new int[] { 1, 2, 3, 4, -1, 0 };
			Vm.TraceConfig cfg = new Vm.TraceConfig(5000L, new int[] { 500, 501, 502 }, 500, 12);
			Vm.TraceSink sink = (cycle, config) -> {
				String regs = Arrays.toString(cycle.machine().registers());
				String watches = Arrays.toString(cycle.machine().watchValues());
				System.out.println(
						"cycle=" + cycle.cycle()
								+ " pc=" + cycle.programCounter()
								+ " op=" + cycle.instruction().op()
								+ " var=" + cycle.instruction().variant()
								+ " args=(" + cycle.instruction().firstOperand() + "," + cycle.instruction().secondOperand() + ")"
								+ " regs=" + regs
								+ " sp=" + cycle.machine().spValue()
								+ " watch=" + watches
								+ " nextPc=" + cycle.flow().nextProgramCounter());
			};

			System.out.println("\nExecution trace:");
			TraceRunner.runWithTrace(source, input, cfg, sink);
		} else {
			System.out.println("Compilation failed");
			System.out.println(result);
		}
	}
}
