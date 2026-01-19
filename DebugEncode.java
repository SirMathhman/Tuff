public class DebugEncode {
    public static void main(String[] args) {
        long secondOperand = 100L;
        long encoded = 0;
        encoded |= (secondOperand & 0x0000_FFFF_FFFF_FFFFL) << 24;
        System.out.println("secondOperand: " + secondOperand);
        System.out.println("encoded (hex): 0x" + Long.toHexString(encoded));
        
        // Now decode
        long decoded = (encoded >>> 24) & 0x0000_FFFF_FFFF_FFFFL;
        System.out.println("decoded: " + decoded);
        System.out.println("decoded (hex): 0x" + Long.toHexString(decoded));
    }
}
