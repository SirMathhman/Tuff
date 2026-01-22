import json

opcodes = {
    0: "Load",
    1: "Store",
    2: "Add",
    12: "In",
    24: "Halt"
}

variants = {
    0: "Immediate",
    1: "Direct",
    2: "Indirect"
}

instructions_json = """[
  {"opcode": 0, "variant": 0, "operand1": 0, "operand2": 0},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 1, "operand2": 900},
  {"opcode": 1, "variant": 1, "operand1": 1, "operand2": 902},
  {"opcode": 12, "variant": 0, "operand1": 0},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 901},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 2, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 0, "operand2": 904},
  {"opcode": 0, "variant": 1, "operand1": 1, "operand2": 902},
  {"opcode": 2, "variant": 0, "operand1": 0, "operand2": 1},
  {"opcode": 1, "variant": 2, "operand1": 2, "operand2": 0},
  {"opcode": 0, "variant": 0, "operand1": 0, "operand2": 1},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 1, "operand2": 900},
  {"opcode": 1, "variant": 1, "operand1": 1, "operand2": 902},
  {"opcode": 12, "variant": 0, "operand1": 0},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 901},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 2, "operand2": 900},
  {"opcode": 0, "variant": 1, "operand1": 0, "operand2": 904},
  {"opcode": 0, "variant": 1, "operand1": 1, "operand2": 902},
  {"opcode": 2, "variant": 0, "operand1": 0, "operand2": 1},
  {"opcode": 1, "variant": 2, "operand1": 2, "operand2": 0},
  {"opcode": 0, "variant": 0, "operand1": 1, "operand2": 904},
  {"opcode": 0, "variant": 0, "operand1": 2, "operand2": 0},
  {"opcode": 2, "variant": 0, "operand1": 1, "operand2": 2},
  {"opcode": 1, "variant": 1, "operand1": 1, "operand2": 903},
  {"opcode": 0, "variant": 2, "operand1": 1, "operand2": 903},
  {"opcode": 0, "variant": 0, "operand1": 0, "operand2": 904},
  {"opcode": 0, "variant": 0, "operand1": 3, "operand2": 1},
  {"opcode": 2, "variant": 0, "operand1": 0, "operand2": 3},
  {"opcode": 1, "variant": 1, "operand1": 0, "operand2": 902},
  {"opcode": 0, "variant": 2, "operand1": 0, "operand2": 902},
  {"opcode": 2, "variant": 0, "operand1": 1, "operand2": 0},
  {"opcode": 1, "variant": 1, "operand1": 1, "operand2": 900},
  {"opcode": 24, "variant": 1, "operand1": 900}
]"""

instructions = json.loads(instructions_json)

# Simulate execution
registers = [0, 0, 0, 0]
memory = [0] * 1024
stdin_idx = 0
stdin = [5, 10]

print("=== Instruction Trace ===\n")

for i, instr in enumerate(instructions):
    op = opcodes.get(instr["opcode"], "Unknown")
    var = variants.get(instr["variant"], "Unknown")
    op1 = instr.get("operand1")
    op2 = instr.get("operand2")
    
    print(f"{i:2d}: {op:5s} {var:8s} r{op1}", end="")
    if op2 is not None:
        print(f" {op2:3d}", end="")
    else:
        print("    ", end="")
    
    # Execute
    if instr["opcode"] == 0:  # Load
        if instr["variant"] == 0:  # Immediate
            registers[op1] = op2
            print(f"  -> r{op1} = {op2}")
        elif instr["variant"] == 1:  # Direct
            registers[op1] = memory[op2]
            print(f"  -> r{op1} = mem[{op2}] = {memory[op2]}")
        elif instr["variant"] == 2:  # Indirect
            addr = memory[op2]
            registers[op1] = memory[addr]
            print(f"  -> r{op1} = mem[mem[{op2}]] = mem[{addr}] = {memory[addr]}")
    elif instr["opcode"] == 1:  # Store
        if instr["variant"] == 1:  # Direct
            memory[op2] = registers[op1]
            print(f"  -> mem[{op2}] = r{op1} = {registers[op1]}")
        elif instr["variant"] == 2:  # Indirect
            addr = registers[op2]
            memory[addr] = registers[op1]
            print(f"  -> mem[r{op2}] = mem[{addr}] = r{op1} = {registers[op1]}")
    elif instr["opcode"] == 2:  # Add
        if instr["variant"] == 0:  # Immediate
            registers[op1] = registers[op1] + registers[op2]
            print(f"  -> r{op1} = r{op1} + r{op2} = {registers[op1]}")
    elif instr["opcode"] == 12:  # In
        registers[op1] = stdin[stdin_idx]
        stdin_idx += 1
        print(f"  -> r{op1} = stdin = {registers[op1]}")
    elif instr["opcode"] == 24:  # Halt
        exit_code = memory[op2] if instr["variant"] == 1 else 0
        print(f"  -> HALT with {exit_code}")
        break

print(f"\n=== Final State ===")
print(f"Registers: {registers}")
print(f"mem[904]: {memory[904]}")
print(f"mem[905]: {memory[905]}")
print(f"Exit code: {memory[900]}")
