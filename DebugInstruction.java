public class DebugInstruction {
    public static void main(String[] args) {
        // Operation.Load = 0, Variant.Constant = 0
        int operation = 0; // Load
        int variant = 0;   // Constant
        long firstOperand = 0;
        long secondOperand = 100L;
        
        long encoded = 0;
        encoded |= ((long) operation & 0xffL) << 56;
        encoded |= ((long) variant & 0xffL) << 48;
        encoded |= firstOperand & 0x0000_FFFF_FFFF_FFFFL;
        encoded |= (secondOperand & 0x0000_FFFF_FFFF_FFFFL) << 24;
        
        System.out.println("Encoded instruction: 0x" + Long.toHexString(encoded));
        System.out.println("Encoded instruction (binary): " + Long.toBinaryString(encoded));
        
        // Now decode
        int decOp = (int) ((encoded >>> 56) & 0xff);
        int decVar = (int) ((encoded >>> 48) & 0xff);
        long decFirst = encoded & 0x0000_FFFF_FFFF_FFFFL;
        long decSecond = (encoded >>> 24) & 0x0000_FFFF_FFFF_FFFFL;
        
        System.out.println("Decoded operation: " + decOp);
        System.out.println("Decoded variant: " + decVar);
        System.out.println("Decoded firstOperand: " + decFirst);
        System.out.println("Decoded secondOperand: " + decSecond);
    }
}
